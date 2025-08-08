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
  console.log(`✅ Bot connected as ${bot.user.tag}`);
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

// Webhook handler
app.post('/webhook', async (req, res) => {
  const data = req.body;

  if (!data || !data.id || !data.billing || !data.line_items) {
    console.log("❌ Invalid order format received:", data);
    return res.status(400).send("Invalid order format");
  }

  const orderId = data.id;
  const customerEmail = data.billing.email;
  const orderTotal = data.total;
  const orderStatus = data.status;
  const productNames = data.line_items.map(item => item.name).join(', ');

  // 🔍 Try to find Minecraft username in meta_data
  let minecraftUsername = null;
  if (Array.isArray(data.meta_data)) {
    const mcMeta = data.meta_data.find(meta => 
      meta.key.toLowerCase().includes('minecraft')
    );
    if (mcMeta) {
      minecraftUsername = mcMeta.value;
    }
  }

  // Fallback: use first name if no meta field found
  if (!minecraftUsername) {
    minecraftUsername = data.billing.first_name || "Unknown";
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_${customerEmail}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`decline_${customerEmail}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
  );

  try {
    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
      console.error("❌ Discord channel not found");
      return res.status(500).send("Discord channel not found");
    }

    await channel.send({
      content: `🛒 **New Order Received!**\n` +
               `📧 **Email:** ${customerEmail}\n` +
               `👤 **Minecraft Username:** \`${minecraftUsername}\`\n` +
               `📦 **Product(s):** ${productNames}\n` +
               `🏢 **Order ID:** ${orderId}\n` +
               `📊 **Status:** ${orderStatus}\n` +
               `💰 **Total:** $${orderTotal}\n` +
               `⏰ **Time:** ${new Date().toLocaleString()}`,
      components: [row],
    });

    console.log(`📦 Webhook handled for ${customerEmail}`);
    res.status(200).send("Webhook received");
  } catch (err) {
    console.error("❌ Error sending to Discord:", err);
    res.status(500).send("Internal error");
  }
});

// Render ping-friendly root route
app.get("/", (req, res) => {
  res.status(200).send("✅ Webhook server is up and running.");
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    bot_status: bot.isReady() ? "connected" : "disconnected"
  });
});

// Manual webhook test
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

// Button interaction
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Express server running at http://localhost:${PORT}`);
});

// Login the bot
bot.login(process.env.DISCORD_BOT_TOKEN);
