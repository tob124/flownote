const {app,net,session}=require('electron')
app.whenReady().then(async()=>{
 for(const url of ['https://api.deepseek.com','https://www.nhs.uk/live-well/eat-well/food-types/milk-and-dairy-nutrition/','https://press.princeton.edu']){
  console.log(JSON.stringify({url,proxy:await session.defaultSession.resolveProxy(url)}))
  for(const [name,fn] of [['node',fetch],['chromium',net.fetch.bind(net)]]){
   const start=Date.now()
   try{const r=await fn(url,{signal:AbortSignal.timeout(15000)});const b=await r.text();console.log(JSON.stringify({name,status:r.status,bytes:b.length,ms:Date.now()-start}))}
   catch(e){console.log(JSON.stringify({name,error:String(e),cause:String(e.cause),ms:Date.now()-start}))}
  }
 }
 app.quit()
})
