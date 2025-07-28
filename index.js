// File: index.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
} = require("discord.js");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Discord bot setup
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

bot.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${bot.user.tag}`);
});

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Webhook endpoint for WooCommerce
app.post("/webhook", async (req, res) => {
  try {
    console.log("📥 Webhook Received:");
    console.log(JSON.stringify(req.body, null, 2));

    const order = req.body;

    // Check for required fields
    if (
      !order ||
      !order.billing ||
      !order.billing.email ||
      !Array.isArray(order.line_items)
    ) {
      console.error("❌ Invalid order format received:", order);
      return res.status(400).send("Invalid order format.");
    }

    const customerEmail = order.billing.email;
    const productNames = order.line_items.map(item => item.name).join(", ");

    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
      console.error("❌ Discord channel not found");
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
      content: `🛒 New order from **${customerEmail}** for: **${productNames}**`,
      components: [row],
    });

    console.log(`📦 Webhook handled for ${customerEmail}`);
    res.status(200).send("Webhook received");
  } catch (err) {
    console.error("❌ Error processing webhook:", err);
    res.status(500).send("Internal server error");
  }
});

// Button interaction handler (with deferReply)
bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const [action, email] = interaction.customId.split("_");

  await interaction.deferReply({ ephemeral: true }); // Defer interaction to avoid timeout

  const message = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Order Status",
    text:
      action === "accept"
        ? "🎉 Your order has been accepted and will be processed shortly."
        : "❌ Unfortunately, your order has been declined. Please contact support.",
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

bot.login(process.env.DISCORD_BOT_TOKEN);

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
