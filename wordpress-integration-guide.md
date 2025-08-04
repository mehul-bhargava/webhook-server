# WordPress to Discord Bot Integration Guide

## 🚀 Quick Setup Steps

### 1. Deploy Your Bot
First, deploy your Discord bot to a hosting service like:
- **Railway** (Recommended)
- **Heroku** 
- **DigitalOcean**
- **AWS**
- **Your own VPS**

### 2. Get Your Webhook URL
After deployment, your webhook URL will be:
```
https://your-domain.com/webhook
```

### 3. WordPress Integration Options

#### Option A: WooCommerce Webhooks (Recommended)
1. Go to **WooCommerce → Settings → Advanced → Webhooks**
2. Click **Add webhook**
3. Configure:
   - **Name**: Discord Order Notifications
   - **Status**: Active
   - **Topic**: Order created (or Order updated)
   - **Delivery URL**: `https://your-domain.com/webhook?secret=YOUR_WEBHOOK_SECRET`
   - **Secret**: Your webhook secret from .env file

#### Option B: WordPress Plugin
Install a webhook plugin like:
- **WP Webhooks**
- **Webhook for WordPress**
- **Advanced Webhooks**

Configure to send POST requests to your webhook URL when orders are created.

#### Option C: Custom WordPress Code
Add this to your theme's `functions.php`:

```php
// Send webhook when WooCommerce order is created
add_action('woocommerce_new_order', 'send_discord_webhook', 10, 1);

function send_discord_webhook($order_id) {
    $order = wc_get_order($order_id);
    
    $webhook_data = array(
        'id' => $order_id,
        'status' => $order->get_status(),
        'total' => $order->get_total(),
        'billing' => array(
            'email' => $order->get_billing_email(),
            'first_name' => $order->get_billing_first_name(),
            'last_name' => $order->get_billing_last_name(),
        ),
        'line_items' => array(),
        'meta_data' => array()
    );
    
    // Add line items
    foreach ($order->get_items() as $item) {
        $webhook_data['line_items'][] = array(
            'name' => $item->get_name(),
            'quantity' => $item->get_quantity(),
            'total' => $item->get_total()
        );
    }
    
    // Add custom fields (including Minecraft username)
    foreach ($order->get_meta_data() as $meta) {
        $webhook_data['meta_data'][] = array(
            'key' => $meta->key,
            'value' => $meta->value
        );
    }
    
    // Send webhook
    wp_remote_post('https://your-domain.com/webhook', array(
        'headers' => array(
            'Content-Type' => 'application/json',
            'X-Webhook-Secret' => 'YOUR_WEBHOOK_SECRET'
        ),
        'body' => json_encode($webhook_data),
        'timeout' => 30
    ));
}
```

### 4. Environment Variables Setup
Create a `.env` file with:
```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
WEBHOOK_SECRET=your_secret_key_here
PORT=3000
```

### 5. Discord Bot Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token to your `.env` file
5. Invite bot to your server with these permissions:
   - Send Messages
   - Use Slash Commands
   - Read Message History

### 6. Get Discord Channel ID
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click your target channel
3. Click "Copy ID"
4. Add to your `.env` file

### 7. Test Your Integration
Send a POST request to test your webhook:
```bash
curl -X POST https://your-domain.com/test-webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_WEBHOOK_SECRET"
```

## 🔧 Troubleshooting

### Common Issues:
1. **Bot not responding**: Check if bot token is correct and bot is online
2. **Channel not found**: Verify channel ID and bot permissions
3. **Webhook not triggering**: Check WordPress webhook configuration
4. **Email not sending**: Verify SMTP settings and app passwords

### Debug Steps:
1. Check server logs for errors
2. Test webhook endpoint with curl
3. Verify Discord bot permissions
4. Test email configuration separately

## 📱 Features Included:
- ✅ Order notifications with full details
- ✅ Minecraft username extraction
- ✅ Email approval/decline system
- ✅ Webhook security with secrets
- ✅ Health check endpoint
- ✅ Test webhook functionality
- ✅ Support for multiple WordPress formats

## 🎯 Next Steps:
1. Deploy your bot to a hosting service
2. Configure WordPress webhooks
3. Test the integration
4. Monitor and adjust as needed