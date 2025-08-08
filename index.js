const express = require("express");
const bodyParser = require("body-parser");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Validate required environment variables
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

// Initialize Discord bot
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
bot.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${bot.user.tag}`);
});

// Email transport config
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Handle WooCommerce webhook
app.post("/webhook", async (req, res) => {
  try {
    console.log("📥 Webhook Received:");
    console.log(JSON.stringify(req.body, null, 2));

    const order = req.body;
    let customerEmail, productNames, orderId, orderStatus, orderTotal;

    if (order.billing && order.line_items) {
      customerEmail = order.billing.email;
      productNames = order.line_items.map(item => item.name).join(", ");
      orderId = order.id || order.number;
      orderStatus = order.status;
      orderTotal = order.total;
    } else if (order.customer_email || order.email) {
      customerEmail = order.customer_email || order.email;
      productNames = order.products || order.items || "Unknown Product";
      orderId = order.order_id || order.id;
      orderStatus = order.status || "pending";
      orderTotal = order.total || order.amount;
    } else {
      console.error("❌ Invalid order format received:", order);
      return res.status(400).send("Invalid order format.");
    }

    if (!customerEmail) {
      console.error("❌ No customer email found in order");
      return res.status(400).send("Customer email is required.");
    }

    // Try to extract Minecraft username
    let mcUsername = order.billing?.minecraft_username || order.minecraft_username;
    if (!mcUsername && Array.isArray(order.meta_data)) {
      const metaField = order.meta_data.find(meta => meta.key === "_billing_minecraft_username");
      mcUsername = metaField ? metaField.value : null;
    }
    if (!mcUsername && order.custom_fields) {
      mcUsername = order.custom_fields.minecraft_username ||
                   order.custom_fields.mc_username ||
                   order.custom_fields.username;
    }

    const mcText = mcUsername ? `🎮 **Minecraft Username:** ${mcUsername}\n` : "";

    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel || !channel.isTextBased?.()) {
      console.error("❌ Discord channel not found or not text-based");
      return res.status(500).send("Discord channel not found");
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${customerEmail}`)
        .setLabel("✅ Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_${customerEmail}`)
        .setLabel("❌ Decline")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content:
        `🛒 **New Order Received!**\n` +
        `📧 **Email:** ${customerEmail}\n` +
        `📦 **Product(s):** ${productNames}\n` +
        `🆔 **Order ID:** ${orderId}\n` +
        `📊 **Status:** ${orderStatus}\n` +
        `💰 **Total:** $${orderTotal}\n` +
        `${mcText}` +
        `⏰ **Time:** ${new Date().toLocaleString()}`,
      components: [row],
    });

    console.log(`📦 Webhook handled for ${customerEmail}`);
    res.status(200).send("Webhook received");
  } catch (err) {
    console.error("❌ Error processing webhook:", err);
    res.status(500).send("Internal server error");
  }
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    bot_status: bot.isReady() ? "connected" : "disconnected"
  });
});

// Test webhook manually
app.post("/test-webhook", async (req, res) => {
  try {
    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
      return res.status(500).send("Discord channel not found");
    }

    await channel.send({
      content: `🧪 **Test Webhook Successful!**\n✅ Bot is connected\n⏰ ${new Date().toLocaleString()}`
    });

    res.status(200).json({ success: true, message: "Test webhook sent" });
  } catch (error) {
    console.error("❌ Test webhook failed:", error);
    res.status(500).send("Test webhook failed");
  }
});

// Handle button clicks
bot.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, email] = interaction.customId.split("_");
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
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    await interaction.editReply({ content: "⚠️ Failed to send email." });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
