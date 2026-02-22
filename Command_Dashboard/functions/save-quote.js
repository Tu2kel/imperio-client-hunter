const { MongoClient } = require('mongodb');
let cachedClient = null;

async function connectToDatabase() {
    if (cachedClient) return cachedClient;
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    cachedClient = client;
    return client;
}

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };
    try {
        const quoteData = JSON.parse(event.body);
        const client = await connectToDatabase();
        const result = await client.db('imperio').collection('quotes').updateOne({ id: quoteData.id }, { $set: quoteData }, { upsert: true });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, result }) };
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
