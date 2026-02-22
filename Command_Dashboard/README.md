# Imperio Command Center - MongoDB Cloud Version

Professional operations dashboard for Imperio Talent Solutions with cloud-synced data.

## Setup Instructions

### 1. Add to Your Repo
```bash
# In your imperiovita.co repo:
cp -r imperio-ops ops/
cd ops
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure MongoDB
1. Create a `.env` file (copy from `.env.example`)
2. Add your MongoDB connection string:
   ```
   MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/imperio?retryWrites=true&w=majority
   ```

### 4. Configure Netlify Environment Variables
1. Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
2. Add: `MONGODB_URI` = your MongoDB connection string

### 5. Deploy
```bash
git add .
git commit -m "Add Imperio ops dashboard"
git push origin main
```

Netlify will auto-deploy in ~30 seconds.

### 6. Access Your Dashboard
Visit: `imperiovita.co/ops/`

---

## Features

✅ **Cloud-Synced Data** - Works across all devices
✅ **Client Management** - Track all your clients
✅ **Bid Tracker** - Government procurement opportunities with deadline countdown
✅ **Supply & PO** - Quote and purchase order management
✅ **Capability Statement** - Generate professional cap statements
✅ **Dark Theme** - Imperial red & gold branding

---

## MongoDB Collections

The app creates these collections automatically:
- `clients` - Client records
- `bids` - Bid/procurement opportunities
- `quotes` - Supply quotes
- `purchase_orders` - Purchase orders

---

## File Structure

```
ops/
├── index.html          # Main app
├── css/
│   └── styles.css      # External CSS (keeps HTML light)
├── functions/          # Netlify serverless functions
│   ├── get-clients.js
│   ├── save-client.js
│   ├── delete-client.js
│   ├── get-bids.js
│   ├── save-bid.js
│   ├── delete-bid.js
│   ├── get-quotes.js
│   ├── save-quote.js
│   ├── delete-quote.js
│   ├── get-pos.js
│   ├── save-po.js
│   └── delete-po.js
├── netlify.toml        # Netlify config
├── package.json        # Dependencies
└── .env.example        # Template for environment variables
```

---

## Security Notes

- This URL is "security by obscurity" - anyone who knows `/ops/` can access it
- For true security, upgrade to Netlify password protection (paid feature)
- **Never commit your `.env` file** - it's in `.gitignore`

---

## Troubleshooting

**Functions not working?**
- Check Netlify build logs
- Verify `MONGODB_URI` is set in Netlify environment variables
- Make sure MongoDB IP whitelist includes `0.0.0.0/0` (allow all)

**Data not syncing?**
- Check browser console for API errors
- Verify MongoDB connection string is correct
- Check Netlify function logs

---

**Built for Imperio Talent Solutions**
SDVOSB | CAGE: 152U4 | UEI: YCTTJHXH69A6
