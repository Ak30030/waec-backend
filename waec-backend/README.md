# WAEC USSD Backend

Node.js/Express backend for the WAEC card USSD selling platform.

## Features
- USSD menu handler (BECE & WASSCE card purchase flow)
- SMS PIN delivery via Arkesel
- Admin REST API (PIN management, orders, user accounts)
- JWT auth with superadmin/admin roles
- MongoDB Atlas for storage

## Project Structure

```
waec-backend/
├── server.js              # Entry point
├── config/
│   └── db.js              # MongoDB connection
├── models/
│   ├── Pin.js             # PIN inventory
│   ├── Order.js           # Purchase records
│   └── AdminUser.js       # Admin accounts
├── routes/
│   ├── ussd.js            # USSD webhook (POST /ussd)
│   ├── auth.js            # Login/register (/auth/*)
│   ├── pins.js            # PIN management (/admin/pins/*)
│   ├── orders.js          # Order log (/admin/orders/*)
│   └── admin.js           # User management (/admin/users/*)
├── middleware/
│   └── authAdmin.js       # JWT protect + role guard
└── services/
    └── sms.js             # Arkesel SMS sender
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your values
cp .env.example .env

# 3. Run locally
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for JWT tokens |
| `ARKESEL_API_KEY` | From arkesel.com dashboard |
| `ARKESEL_SENDER_ID` | Registered sender name (e.g. WaecSell) |
| `BECE_PRICE` | Price in GHS for BECE card |
| `WASSCE_PRICE` | Price in GHS for WASSCE card |

## API Routes

### Auth
| Method | Route | Access |
|---|---|---|
| POST | /auth/login | Public |
| POST | /auth/register | Superadmin |
| GET | /auth/me | Logged in |

### Pins
| Method | Route | Access |
|---|---|---|
| GET | /admin/pins | Admin |
| GET | /admin/pins/summary | Admin |
| POST | /admin/pins/bulk | Superadmin |
| DELETE | /admin/pins/:id | Superadmin |

### Orders
| Method | Route | Access |
|---|---|---|
| GET | /admin/orders | Admin |
| GET | /admin/orders/stats | Admin |
| POST | /admin/orders/:id/resend-sms | Admin |

### Users
| Method | Route | Access |
|---|---|---|
| GET | /admin/users | Superadmin |
| DELETE | /admin/users/:id | Superadmin |

### USSD
| Method | Route | Access |
|---|---|---|
| POST | /ussd | Public (called by Arkesel) |

## Uploading PINs (Bulk)

Send a POST request to `/admin/pins/bulk` with your Bearer token:

```json
{
  "pins": [
    { "code": "1234-5678-9012-3456", "type": "BECE" },
    { "code": "9876-5432-1098-7654", "type": "WASSCE" }
  ]
}
```

## Deploying to Render

1. Push this repo to GitHub
2. Create a new Web Service on render.com
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. Add all environment variables from `.env.example`
6. Set your USSD webhook URL on Arkesel to:
   `https://your-render-url.onrender.com/ussd`

## Creating Your First Superadmin

Since `/auth/register` is protected, seed your first superadmin directly:

```js
// Run once with: node seed.js
require("dotenv").config();
const mongoose = require("mongoose");
const AdminUser = require("./models/AdminUser");

mongoose.connect(process.env.MONGO_URI).then(async () => {
  await AdminUser.create({
    name: "Fred",
    email: "fred@yourdomain.com",
    password: "yourpassword",
    role: "superadmin",
  });
  console.log("Superadmin created");
  process.exit();
});
```
