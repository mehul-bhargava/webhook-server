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

// ✅ Webhook endpoint for WooCommerce
app.post("/webhook", async (req, res) => {
  try {
    console.log("📥 Webhook Received:");
    console.log(JSON.stringify(req.body, null, 2));

    const order = req.body;

    // ✅ Validate order format
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

    // 🔍 Extract Minecraft Username (from billing or meta_data)
    let mcUsername = order.billing?.minecraft_username;

if (!mcUsername && Array.isArray(order.meta_data)) {
  const metaField = order.meta_data.find(meta => meta.key === '_billing_minecraft_username');
  mcUsername = metaField ? metaField.value : null;
}

const mcText = mcUsername ? `🎮 **Minecraft Username:** ${mcUsername}\n` : '';



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

    // 📝 Message content
    const mcText = mcUsername ? `🎮 **Minecraft Username:** ${mcUsername}\n` : "";


    await channel.send({
      content: `🛒 **New Order Received!**\n📧 **Email:** ${customerEmail}\n📦 **Product(s):** ${productNames}\n${mcText}`,
      components: [row],
    });

    console.log(`📦 Webhook handled for ${customerEmail}`);
    res.status(200).send("Webhook received");
  } catch (err) {
    console.error("❌ Error processing webhook:", err);
    res.status(500).send("Internal server error");
  }
});

// 🔘 Button interaction handler
bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const [action, email] = interaction.customId.split("_");

  await interaction.deferReply({ ephemeral: true });

  const message = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Order Status",
    text:
      action === "accept"
        ? `🎉 Congratulations!

Your order has been successfully accepted and is now being processed. You will receive your requested resource within 24 hours.

If we fail to deliver within the timeframe, you may raise a support ticket on our Discord server.

🔗 Join our Discord: https://discord.gg/eXPMuw52hV

Thank you for choosing ArcMC!

– The ArcMC Team`
        : `❌ Order Declined

We regret to inform you that your recent order could not be processed.

This may have occurred due to one of the following reasons:
- Invalid payment information
- Unauthorized or incorrect username
- Technical issues during checkout

For assistance or to try again, please contact our support team.

🔗 Join our Discord: https://discord.gg/eXPMuw52hV

We apologize for the inconvenience and appreciate your understanding.

– The ArcMC Team`,
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

// 🟢 Start everything
bot.login(process.env.DISCORD_BOT_TOKEN);

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
