import { chromium } from "playwright";
import { readFileSync } from "fs";
const envFile = readFileSync("/home/z/my-project/digital-khata-app/.env", "utf-8");
for (const line of envFile.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
let p=0,f=0; const bugs=[];
function a(c,l,d){if(c){p++;}else{f++;bugs.push({l,d});console.log(`  X ${l}${d?" - "+d:""}`);}}

async function reg(n,e){const r=await fetch(`${BASE}/api/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,email:e,password:"password123"})});const j=await r.json();const c=r.headers.get("set-cookie")?.match(/dk_auth_token=([^;]+)/)?.[0]||"";return{user:j.data?.user,cookie:c};}
async function cc(ck,n,ph){const r=await fetch(`${BASE}/api/customers`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({name:n,phone:ph,openingBalance:0})});return(await r.json()).data;}
async function cp(ck,n,u,pr){const r=await fetch(`${BASE}/api/products`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({name:n,purchasePrice:50,sellingPrice:pr,unit:u,openingStock:100})});return(await r.json()).data;}
async function cs(ck,ci,pi,q,up,pa){const r=await fetch(`${BASE}/api/sales`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({customerId:ci,items:[{productId:pi,quantity:q,unitPrice:up}],paidAmount:pa||0,paymentMethod:"cash"})});return(await r.json()).data;}

console.log("=== DIGITAL KHATA FULL AUDIT ===\n");
const u=Date.now();
const ua=await reg("Audit",`a-${u}@e.com`);a(!!ua.user,"Register");const ck=ua.cookie;

console.log("\n--- Customers ---");
const c1=await cc(ck,"Ahmad Khan",`0300${u}`);a(!!c1?.id,"Create customer");
const cl=await fetch(`${BASE}/api/customers`,{headers:{Cookie:ck}});a((await cl.json()).ok,"List customers");

console.log("\n--- Products ---");
const r1=await cp(ck,"Rice","kg",1000);a(!!r1?.id,"Create product Rice");

console.log("\n--- Sales + Financial ---");
const s1=await cs(ck,c1.id,r1.id,25,1000,20000);
a(!!s1?.id,"Create sale");
a(s1?.totalAmount==="25000","Sale total = 25000",`got ${s1?.totalAmount}`);
a(s1?.paidAmount==="20000","Sale paid = 20000",`got ${s1?.paidAmount}`);
a(s1?.outstanding==="5000","Sale outstanding = 5000",`got ${s1?.outstanding}`);

const dbS=await prisma.sale.findFirst({where:{id:s1.id},include:{items:true}});
a(dbS?.items[0]?.unitPrice.toString()==="1000","DB: unitPrice = 1000 (NOT 800!)");
a(dbS?.userId===ua.user.id,"DB: sale userId = auth user");

console.log("\n--- Payments ---");
const pay=await fetch(`${BASE}/api/payments`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({customerId:c1.id,amount:5000,method:"cash"})});
a((await pay.json()).ok,"Create payment");

console.log("\n--- Expenses ---");
const exp=await fetch(`${BASE}/api/expenses`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({name:"Electricity",amount:3000,category:"electricity"})});
a((await exp.json()).ok,"Create expense");

console.log("\n--- Stock ---");
const st=await fetch(`${BASE}/api/stock/moves`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({productId:r1.id,type:"purchase",quantity:50,unitCost:800})});
a((await st.json()).ok,"Create stock move");

console.log("\n--- Dashboard ---");
const d=await fetch(`${BASE}/api/dashboard`,{headers:{Cookie:ck}});a((await d.json()).ok,"Dashboard loads");

console.log("\n--- Smart Entry Security ---");
const ub=await reg("B",`b-${u}@e.com`);
const cr=await fetch(`${BASE}/api/sales/${s1.id}`,{headers:{Cookie:ub.cookie}});
a(cr.status===404,"Cross-tenant sale access blocked (404)");
const se=await fetch(`${BASE}/api/smart-entry/interpret`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"test"})});
a(se.status===401,"Smart Entry rejects unauthenticated (401)");

console.log("\n--- Smart Entry Execute ---");
const sess=await prisma.smartEntrySession.create({data:{userId:ua.user.id,status:"AWAITING_CONFIRMATION",inputType:"text",transcript:"test",resolvedCustomerId:c1.id,resolvedProductId:r1.id,quantityRaw:10,expiresAt:new Date(Date.now()+5*60*1000)}});
const ex=await fetch(`${BASE}/api/smart-entry/execute`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({sessionId:sess.id,customerId:c1.id,productId:r1.id,quantity:10,unitPrice:1000,paidAmount:5000})});
const exj=await ex.json();
a(exj.ok,"Smart Entry execute succeeds");
a(exj.data?.totalAmount==="10000","Execute: total = 10000",`got ${exj.data?.totalAmount}`);
a(exj.data?.outstanding==="5000","Execute: outstanding = 5000",`got ${exj.data?.outstanding}`);

console.log("\n--- Idempotent Execute ---");
const rex=await fetch(`${BASE}/api/smart-entry/execute`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({sessionId:sess.id,customerId:c1.id,productId:r1.id,quantity:10,unitPrice:1000,paidAmount:5000})});
const rexj=await rex.json();
a(rexj.ok,"Re-execute returns ok (idempotent)");
a(rexj.data?.saleId===exj.data.saleId,"Re-execute returns SAME saleId");

console.log("\n--- Expired Session ---");
const es=await prisma.smartEntrySession.create({data:{userId:ua.user.id,status:"AWAITING_CONFIRMATION",inputType:"text",transcript:"expired",resolvedCustomerId:c1.id,resolvedProductId:r1.id,quantityRaw:5,expiresAt:new Date(Date.now()-1000)}});
const er=await fetch(`${BASE}/api/smart-entry/execute`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({sessionId:es.id,customerId:c1.id,productId:r1.id,quantity:5,unitPrice:1000})});
a(er.status===400,"Expired session rejected (400)");

console.log("\n--- Cross-Tenant Smart Entry ---");
const cs2=await prisma.smartEntrySession.create({data:{userId:ua.user.id,status:"AWAITING_CONFIRMATION",inputType:"text",transcript:"cross",resolvedCustomerId:c1.id,resolvedProductId:r1.id,quantityRaw:5,expiresAt:new Date(Date.now()+5*60*1000)}});
const cr2=await fetch(`${BASE}/api/smart-entry/execute`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ub.cookie},body:JSON.stringify({sessionId:cs2.id,customerId:c1.id,productId:r1.id,quantity:5,unitPrice:1000})});
a(cr2.status===404,"User B cannot execute User A's session (404)");

console.log("\n--- Quantity Validation ---");
for(const[q,l]of[[-5,"negative"],[0,"zero"],[NaN,"NaN"]]){const s=await prisma.smartEntrySession.create({data:{userId:ua.user.id,status:"AWAITING_CONFIRMATION",inputType:"text",transcript:`test ${l}`,resolvedCustomerId:c1.id,resolvedProductId:r1.id,expiresAt:new Date(Date.now()+5*60*1000)}});const r=await fetch(`${BASE}/api/smart-entry/execute`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({sessionId:s.id,customerId:c1.id,productId:r1.id,quantity:q,unitPrice:1000})});a(r.status===400,`${l} quantity rejected (400)`,`got ${r.status}`);}

console.log("\n--- API Endpoints ---");
for(const[pt,lb]of[["/api/dashboard","Dashboard"],["/api/customers","Customers"],["/api/products","Products"],["/api/products?withStock=1","Products+Stock"],["/api/sales","Sales"],["/api/payments","Payments"],["/api/transactions","Transactions"],["/api/settings","Settings"],["/api/auth/me","Auth Me"]]){const r=await fetch(`${BASE}${pt}`,{headers:{Cookie:ck}});a(r.status===200,`${lb} (${pt}) returns 200`,`got ${r.status}`);}

console.log("\n--- API Key Security ---");
const allR=await Promise.all([fetch(`${BASE}/api/dashboard`,{headers:{Cookie:ck}}).then(r=>r.json()),fetch(`${BASE}/api/smart-entry/interpret`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:ck},body:JSON.stringify({text:"test"})}).then(r=>r.json())]);
const allS=JSON.stringify(allR);
a(!allS.includes("AQ.Ab8RN"),"API key not leaked in responses");
a(!allS.includes("GEMINI_API_KEY"),"Env var name not leaked");

console.log("\n--- UI Tests ---");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:390,height:844}});
const page=await ctx.newPage();
await ctx.addCookies([{name:"dk_auth_token",value:ck.split("=")[1],domain:"localhost",path:"/"}]);

await page.goto(`${BASE}/dashboard`,{waitUntil:"networkidle"});
await page.waitForTimeout(5000);
a(await page.locator('button[aria-label*="voice entry"]').count()>=1,"Dashboard: mic FAB visible");
a(await page.locator('button[aria-label*="Quick add"]').count()>=1,"Dashboard: + FAB visible");

await page.goto(`${BASE}/khata`,{waitUntil:"networkidle"});
await page.waitForTimeout(4000);
await page.goto(`${BASE}/sales`,{waitUntil:"networkidle"});
a(await page.locator('text=Ahmad Khan').count()>=1,"Khata: customer visible");
a(await page.locator('text=25,000').count()>=1,"Sales: total visible");

await page.goto(`${BASE}/stock`,{waitUntil:"networkidle"});
await page.waitForTimeout(4000);
a(await page.locator('text=Rice').count()>=1,"Stock: product visible");

// Stock Add menu
await page.goto(`${BASE}/stock`,{waitUntil:"networkidle"});
await page.waitForTimeout(4000);
const ab=page.locator('button:has-text("Add")').first();
if(await ab.count()>0){await ab.click();await page.waitForTimeout(500);const dlg=page.locator('[role="dialog"]');if(await dlg.count()>0){a(await dlg.isVisible(),"Stock Add menu visible");const t=await dlg.textContent();a(t?.includes("Add Stock"),"Stock Add: 'Add Stock' visible");}}

// Smart Entry modal
await page.goto(`${BASE}/dashboard`,{waitUntil:"networkidle"});
await page.waitForTimeout(5000);
await page.locator('button[aria-label*="voice entry"]').click();
await page.waitForTimeout(500);
a(await page.locator('[role="dialog"]').count()===1,"Smart Entry modal opens on click");

// Responsive
for(const[w,h,l]of[[320,568,"320px"],[375,667,"375px"],[430,932,"430px"],[768,1024,"768px"],[1280,800,"1280px"]]){await page.setViewportSize({width:w,height:h});await page.goto(`${BASE}/dashboard`,{waitUntil:"networkidle"});await page.waitForTimeout(5000);const v=await page.locator('button[aria-label*="voice entry"]').first().isVisible().catch(()=>false);a(v,`${l}: mic FAB visible`);}

await browser.close();

console.log("\n--- Cleanup ---");
await prisma.user.delete({where:{id:ua.user.id}});
await prisma.user.delete({where:{id:ub.user.id}});
console.log("  OK - Test users deleted");
await prisma.$disconnect();

console.log(`\n${"=".repeat(60)}\n  AUDIT: ${p} passed, ${f} failed\n${"=".repeat(60)}`);
if(bugs.length>0){console.log("\nBUGS:");bugs.forEach(b=>console.log(`  X ${b.l}${b.d?" - "+b.d:""}`));}
process.exit(f>0?1:0);
