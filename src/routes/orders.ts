import { FastifyInstance } from "fastify";
import pool from "../db";
import crypto from "crypto";
import axios from "axios";

function generatePickupCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "GMA-";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}


export async function orderRoutes(app: FastifyInstance) {

app.post("/orders/initiate", async (request, reply) => {
  const {
    order_type,
    customer_name,
    customer_email,
    customer_phone,
    address,
    city,
    state,
    items,
  } = request.body as {
    order_type: "pickup" | "delivery";
    customer_name: string;
    customer_email?: string;
    customer_phone: string;
    address?: string;
    city?: string;
    state?: string;
    items: { product_id: string; quantity: number }[];
  };

  // Step 1 — Validate
  if (!customer_name || !customer_phone || !items?.length) {
    return reply.status(400).send({ error: "Name, phone and items are required" });
  }

  if (order_type === "pickup" && !customer_email) {
    return reply.status(400).send({ error: "Email is required for pickup orders" });
  }

  if (order_type === "delivery" && (!address || !city || !state)) {
    return reply.status(400).send({ error: "Address, city and state are required" });
  }

  // Step 2 — Fetch real prices from database
  const productIds = items.map((i) => i.product_id);
  const productResult = await pool.query(
    "SELECT id, name, price FROM products WHERE id = ANY($1)",
    [productIds]
  );

  const productMap = new Map(
    productResult.rows.map((p) => [p.id, p])
  );

  // Step 3 — Calculate real total
  let total_price = 0;
  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      return reply.status(400).send({ error: `Product ${item.product_id} not found` });
    }
    total_price += Number(product.price) * item.quantity;
  }

  // Add delivery fee if delivery order
  if (order_type === "delivery") {
    total_price += 2500;
  }

  // Step 4 — Generate pickup code
  let pickup_code = generatePickupCode();
  let codeExists = true;
  while (codeExists) {
    const existing = await pool.query(
      "SELECT id FROM orders WHERE pickup_code = $1",
      [pickup_code]
    );
    if (existing.rows.length === 0) {
      codeExists = false;
    } else {
      pickup_code = generatePickupCode();
    }
  }

  // Step 5 — Save PENDING order to database
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `INSERT INTO orders 
        (pickup_code, order_type, customer_name, customer_email,
         customer_phone, address, city, state, total_price, 
         payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       RETURNING id`,
      [
        pickup_code,
        order_type,
        customer_name,
        customer_email || null,
        customer_phone,
        address || null,
        city || null,
        state || null,
        total_price,
      ]
    );

    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (const item of items) {
      const product = productMap.get(item.product_id);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, item.product_id, product.name, product.price, item.quantity]
      );
    }

    await client.query("COMMIT");

    // Step 6 — Ask Paystack for a payment link
    // Amount must be in KOBO (multiply by 100)
    // N1000 = 100000 kobo
    const paystackRes = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: customer_email || `${customer_phone}@gmalli.com`,
        amount: Math.round(total_price * 100), // convert to kobo
        reference: `GMALLI-${orderId}-${Date.now()}`, // unique reference
        metadata: {
          order_id: orderId,
          pickup_code,
          customer_name,
          order_type,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Save payment reference to order
    await pool.query(
      "UPDATE orders SET payment_reference = $1 WHERE id = $2",
      [paystackRes.data.data.reference, orderId]
    );

    // Return payment link to frontend
    return reply.status(201).send({
      payment_url: paystackRes.data.data.authorization_url,
      reference: paystackRes.data.data.reference,
      order_id: orderId,
      pickup_code,
      total_price,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Order initiation failed:", err);
    return reply.status(500).send({ error: "Failed to initiate order" });
  } finally {
    client.release();
  }
});

  app.post("/orders/webhook", async (request, reply) => {
    const secret = process.env.PAYSTACK_SECRET_KEY!;
    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(request.body))
      .digest("hex");

    const signature = request.headers["x-paystack-signature"];
    if (hash !== signature) {
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const event = request.body as { event: string; data: any };

    if (event.event === "charge.success") {
      const reference = event.data.reference;
      // TODO: mark the matching order as paid in Postgres
      // e.g. UPDATE orders SET status = 'paid' WHERE pickup_code = $1 or a stored reference
    }

    return reply.status(200).send({ received: true });
  });

  app.post("/orders", async (request, reply) => {
    const {
      order_type,
      customer_name,
      customer_email,
      customer_phone,
      address,
      city,
      state,
      items,
    } = request.body as {
      order_type: "pickup" | "delivery";
      customer_name: string;
      customer_email?: string;
      customer_phone: string;
      address?: string;
      city?: string;
      state?: string;
      items: { product_id: string; quantity: number }[];
    };

    if (!customer_name || !customer_phone || !items?.length) {
      return reply.status(400).send({
        error: "Name, phone and items are required",
      });
    }

    if (order_type === "pickup" && !customer_email) {
      return reply.status(400).send({
        error: "Email is required for pickup orders",
      });
    }

    if (order_type === "delivery" && (!address || !city || !state)) {
      return reply.status(400).send({
        error: "Address, city and state are required for delivery orders",
      });
    }

    const productIds = items.map((item) => item.product_id);
    const productResult = await pool.query(
      `SELECT id, name, price FROM products WHERE id = ANY($1)`,
      [productIds],
    );

    const productMap = new Map(productResult.rows.map((p) => [p.id, p]));

    // Step 3 — Calculate real total from database prices
    let total_price = 0;
    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product) {
        return reply.status(400).send({
          error: `Product ${item.product_id} not found`,
        });
      }
      total_price += Number(product.price) * item.quantity;
    }

    let pickup_code = generatePickupCode();
    let codeExists = true;

    while (codeExists) {
      const existing = await pool.query(
        "SELECT id FROM orders WHERE pickup_code = $1",
        [pickup_code],
      );
      if (existing.rows.length === 0) {
        codeExists = false;
      } else {
        pickup_code = generatePickupCode();
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const orderResult = await client.query(
        `INSERT INTO orders 
          (pickup_code, order_type, customer_name, customer_email, 
           customer_phone, address, city, state, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          pickup_code,
          order_type,
          customer_name,
          customer_email || null,
          customer_phone,
          address || null,
          city || null,
          state || null,
          total_price,
        ],
      );

      const orderId = orderResult.rows[0].id;

      for (const item of items) {
        const product = productMap.get(item.product_id);
        await client.query(
          `INSERT INTO order_items 
            (order_id, product_id, product_name, price, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            orderId,
            item.product_id,
            product.name,
            product.price,
            item.quantity,
          ],
        );
      }

      await client.query("COMMIT");

      return reply.status(201).send({
        pickup_code,
        total_price,
        customer_name,
        order_type,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Order creation failed:", err);
      return reply.status(500).send({ error: "Failed to create order" });
    } finally {
      client.release();
    }
  });

  app.get("/orders/:code", async (request, reply) => {
    const { code } = request.params as { code: string };

    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE pickup_code = $1",
      [code.toUpperCase()],
    );

    if (orderResult.rows.length === 0) {
      return reply.status(404).send({ error: "Order not found" });
    }

    const itemsResult = await pool.query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [orderResult.rows[0].id],
    );

    return reply.send({
      ...orderResult.rows[0],
      items: itemsResult.rows,
    });
  });
}

