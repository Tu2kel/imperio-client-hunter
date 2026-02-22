const { MongoClient } = require('mongodb');

let cachedClient = null;

async function connectToDatabase() {
    if (cachedClient) {
        return cachedClient;
    }

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    cachedClient = client;
    return client;
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        const { id } = JSON.parse(event.body);
        
        const client = await connectToDatabase();
        const db = client.db('imperio');
        
        const result = await db.collection('clients').deleteOne({ id });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, result })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
