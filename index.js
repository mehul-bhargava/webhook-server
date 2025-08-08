const express = require("express");
const bodyParser = require("body-parser");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder,
} = require("discord.js");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Environment Variable Validation
const requiredEnvVars = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_CHANNEL_ID",
  "EMAIL_USER",
  "EMAIL_PASS",
  "SMTP_HOST",
  "SMTP_PORT"
];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
});

// ✅ Discord Bot Init
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

bot.once(Events.ClientReady, () => {
  console.log(`✅ Bot connected as ${bot.user.tag}`);
});

// ✅ Email Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Webhook Endpoint
app.post('/webhook', async (req, res) => {
  let data;

  // If orderId is present, fetch from WooCommerce
  if (req.body.id && typeof req.body.id === "number") {
    const orderId = req.body.id;

    try {
      const response = await axios.get(
        `${process.env.WC_API_URL}/orders/${orderId}`,
        {
          auth: {
            username: process.env.WC_CONSUMER_KEY,
            password: process.env.WC_CONSUMER_SECRET
          }
        }
      );
      data = response.data;
    } catch (error) {
      console.error("❌ Failed to fetch from WooCommerce:", error.response?.data || error.message);
      return res.status(500).send("Error fetching order from WooCommerce");
    }
  } else {
    // Use full order object directly from test (e.g., Postman)
    data = req.body;
    console.log("🧪 Using test mode with provided order body");
  }

  try {
    const orderId = data.id || "TestOrder";
    const customerEmail = data.billing?.email || "unknown@example.com";
    const orderTotal = data.total || "0.00";
    const orderStatus = (data.status || "pending").toUpperCase();
    const productNames = (data.line_items || [])
      .map(item => item.name)
      .join(', ') || "No products";
    const paymentMethod = data.payment_method_title || "N/A";

    let minecraftUsername = "Unknown";
    if (Array.isArray(data.meta_data)) {
      const mcMeta = data.meta_data.find(meta =>
        meta.key.toLowerCase().includes('minecraft')
      );
      if (mcMeta) {
        minecraftUsername = mcMeta.value;
      }
    }
    if (!minecraftUsername && data.billing?.first_name) {
      minecraftUsername = data.billing.first_name;
    }

    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setColor(0xff4b4b)
      .setTitle("🛍️ Order Received")
      .addFields(
        { name: "Order ID", value: `\`${orderId}\``, inline: true },
        { name: "Minecraft Username", value: `\`${minecraftUsername}\``, inline: true },
        { name: "Amount", value: `\`$${orderTotal}\``, inline: true },
        { name: "Products", value: `${productNames}`, inline: false },
        { name: "Status", value: `\`${orderStatus}\``, inline: true },
        { name: "Payment Method", value: `${paymentMethod}`, inline: true }
      )
      .setFooter({ text: `Order Management System • ${new Date().toLocaleString()}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${orderId}_${customerEmail}`)
        .setLabel("✅ Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_${orderId}_${customerEmail}`)
        .setLabel("❌ Decline")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [embed],
      components: [row]
    });

    console.log("✅ Order sent to Discord:", orderId);
    res.status(200).send("Order processed");
  } catch (error) {
    console.error("❌ Failed to send order:", error.message);
    res.status(500).send("Error processing order");
  }
});


// ✅ Root & Health Endpoints
app.get("/", (req, res) => {
  res.status(200).send("✅ Webhook server is up and running.");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    bot_status: bot.isReady() ? "connected" : "disconnected"
  });
});

// ✅ Test Webhook Endpoint
app.post("/test-webhook", async (req, res) => {
  try {
    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) return res.status(500).send("Discord channel not found");

    await channel.send({
      content: `🧪 **Test Webhook Successful!**\n✅ Bot is connected\n⏰ ${new Date().toLocaleString()}`
    });

    res.status(200).json({ success: true, message: "Test webhook sent" });
  } catch (error) {
    console.error("❌ Test webhook failed:", error);
    res.status(500).send("Test webhook failed");
  }
});

// ✅ Handle Button Interaction & Remove Buttons After Click
bot.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, orderId, email] = interaction.customId.split("_");
  await interaction.deferReply({ ephemeral: true });

  const message = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Order Status",
    text:
      action === "accept"
        ? `🎉 Congratulations!\n\nYour order has been accepted.\n\nJoin Discord: https://discord.gg/eXPMuw52hV\n\n– The ArcMC Team`
        : `❌ Order Declined\n\nContact support if needed.\n\nJoin Discord: https://discord.gg/eXPMuw52hV\n\n– The ArcMC Team`,
  };

  try {
    await transporter.sendMail(message);
    await interaction.editReply({ content: `📩 Email sent to ${email}` });
    console.log(`📧 Email sent to ${email} for ${action}`);

    // 🧼 Remove Buttons after interaction
    await interaction.message.edit({ components: [] });

  } catch (error) {
    console.error("❌ Failed to send email:", error);
    await interaction.editReply({ content: "⚠️ Failed to send email." });
  }
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Express server running at http://localhost:${PORT}`);
});

// ✅ Login Discord Bot
bot.login(process.env.DISCORD_BOT_TOKEN);
