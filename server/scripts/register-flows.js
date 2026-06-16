import 'dotenv/config';
import { registerFlow, publishFlow, getFlowStatus } from '../services/whatsappFlows.js';

async function main() {
  try {
    console.log('🔍 Checking current Flow status...');
    const status = await getFlowStatus();
    console.log(JSON.stringify(status, null, 2));

    console.log('\n📦 Registering/updating Flow with Meta...');
    const flowId = await registerFlow();
    console.log(`✅ Flow registered/updated. Flow ID: ${flowId}`);

    console.log('\n🚀 Publishing Flow...');
    const pubResult = await publishFlow();
    console.log(`✅ Flow published:`, JSON.stringify(pubResult, null, 2));

    console.log('\n🎉 Flow registration complete!');
    console.log(`\n📌 Add to your .env with:\n  WHATSAPP_MAIN_FLOW_ID=${flowId}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Flow registration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
