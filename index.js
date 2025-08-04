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
  Events,
} = require("discord.js");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 🔒 Middleware for webhook security
const verifyWebhookSecret = (req, res, next) => {
  const providedSecret = req.headers['x-webhook-secret'] || req.query.secret;
  const expectedSecret = process.env.WEBHOOK_SECRET;
  
  if (expectedSecret && providedSecret !== expectedSecret) {
    console.error("❌ Unauthorized webhook attempt");
    return res.status(401).send("Unauthorized");
  }
  
  next();
};

// 🛠️ Discord Bot Setup
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

bot.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${bot.user.tag}`);
});

// 📧 Nodemailer Setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 🌐 Webhook Endpoint
app.post("/webhook", verifyWebhookSecret, async (req, res) => {
  try {
    console.log("📥 Webhook Received:");
    console.log(JSON.stringify(req.body, null, 2));

    const order = req.body;

    // 🔍 Enhanced Order Validation for WordPress/WooCommerce
    if (!order) {
      console.error("❌ No order data received");
      return res.status(400).send("No order data received.");
    }

    // Handle different WordPress webhook formats
    let customerEmail, productNames, orderId, orderStatus, orderTotal;
    
    // WooCommerce format
    if (order.billing && order.line_items) {
      customerEmail = order.billing.email;
      productNames = order.line_items.map((item) => item.name).join(", ");
      orderId = order.id || order.number;
      orderStatus = order.status;
      orderTotal = order.total;
    }
    // Custom WordPress format
    else if (order.customer_email || order.email) {
      customerEmail = order.customer_email || order.email;
      productNames = order.products || order.items || "Unknown Product";
      orderId = order.order_id || order.id;
      orderStatus = order.status || "pending";
      orderTotal = order.total || order.amount;
    }
    // Fallback validation
    else {
      console.error("❌ Invalid order format received:", order);
      return res.status(400).send("Invalid order format.");
    }

    if (!customerEmail) {
      console.error("❌ No customer email found in order");
      return res.status(400).send("Customer email is required.");
    }

    // 🔍 Extract Minecraft Username
    let mcUsername = order.billing?.minecraft_username || order.minecraft_username;

    if (!mcUsername && Array.isArray(order.meta_data)) {
      const metaField = order.meta_data.find(
        (meta) => meta.key === "_billing_minecraft_username"
      );
      mcUsername = metaField ? metaField.value : null;
    }
    
    // Check custom fields for Minecraft username
    if (!mcUsername && order.custom_fields) {
      mcUsername = order.custom_fields.minecraft_username || 
                   order.custom_fields.mc_username ||
                   order.custom_fields.username;
    }

    const mcText = mcUsername
      ? `🎮 **Minecraft Username:** ${mcUsername}\n`
      : "";

    // 📡 Fetch Discord Channel
    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
      console.error("❌ Discord channel not found");
      return res.status(500).send("Discord channel not found");
    }

    // 🎛️ Buttons for Approval
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

    // 📨 Send Message to Discord
    await channel.send({
      content: `🛒 **New Order Received!**\n` +
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

// 🔍 Health Check Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    bot_status: bot.isReady() ? "connected" : "disconnected"
  });
});

// 📋 Test Webhook Endpoint
app.post("/test-webhook", verifyWebhookSecret, async (req, res) => {
  try {
    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
      return res.status(500).send("Discord channel not found");
    }

    await channel.send({
      content: `🧪 **Test Webhook Successful!**\n` +
               `✅ Bot is connected and working\n` +
               `⏰ **Time:** ${new Date().toLocaleString()}`
    });

    res.status(200).json({
      success: true,
      message: "Test webhook sent to Discord successfully"
    });
  } catch (error) {
    console.error("❌ Test webhook failed:", error);
    res.status(500).send("Test webhook failed");
  }
});

// 🔘 Handle Button Interactions
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

// 🟢 Start Server & Bot
const PORT = process.env.PORT || 3000;
console.log("DISCORD TOKEN START:", process.env.DISCORD_BOT_TOKEN?.slice(0, 8)); // Debug log

bot.login(process.env.DISCORD_BOT_TOKEN);
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
