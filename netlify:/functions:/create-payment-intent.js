// Runs on Netlify's servers, never in the browser.
// Reads the secret key from Netlify's environment variables — never hardcoded, never sent to the client.
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Source of truth for pricing — the browser only ever sends a tier CODE, never a dollar amount.
// This is what stops someone from tampering with the price in their browser before submitting.
const PRICING = {
  single:  11500,  // $115.00, in cents
  quarter: 27000,  // $270.00
  half:    42500,  // $425.00
  three_q: 54000,  // $540.00
  full:    65000,  // $650.00
};

const LABELS = {
  single: 'Single item',
  quarter: 'Quarter load',
  half: 'Half load',
  three_q: 'Three-quarter load',
  full: 'Full load',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { tier, name, phone, email, address, city, state, zip, jobDate, jobWindow, description } = data;

    const amount = PRICING[tier];
    if (!amount) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid load size selected.' }) };
    }
    if (!name || !phone || !address) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required booking details.' }) };
    }

    // manual capture = authorize now, charge later once the job's confirmed done.
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      capture_method: 'manual',
      description: `Junk Movers — ${LABELS[tier]} — ${address}, ${city}, ${state} ${zip}`,
      receipt_email: email || undefined,
      metadata: {
        tier: LABELS[tier],
        customer_name: name,
        phone,
        email: email || '',
        address, city, state, zip,
        job_date: jobDate || '',
        job_window: jobWindow || '',
        description: (description || '').slice(0, 490),
      },
      // Stripe holds authorizations for up to 7 days by default — plenty for same/next-day jobs.
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        amount,
        label: LABELS[tier],
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong creating the payment. Please try again.' }) };
  }
};
