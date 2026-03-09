import{r as $,w as k,g as S}from"./index-Cb4wRrDs.js";function C(){const t=new Date,e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0");return`${e}_${a}`}function v(t){return`${t.replace(/[^\w\u4e00-\u9fa5-]/g,"_")}_${C()}.md`}async function b(t,e){var r,o,s,c,p,g,m,f,d,u,w,h,y;const a=await S();if(!((r=a.apiKey)!=null&&r.trim()))return t;const n=`你是一个知识库整理助手。现有以下已有的 Markdown 总结，以及一条新笔记。请将新笔记融入总结，生成一份新的结构化 Markdown。
要求：
1. 保持原有结构，把新内容合并到合适的小节或新增小节。
2. 对新笔记的引用必须使用格式：[细节](${e.id})，即用方括号写描述文字，括号内是该条笔记的 ID（${e.id}）。
3. 只输出最终 Markdown，不要其他说明。

已有总结：
---
${t||"# 暂无内容"}
---

新笔记（ID: ${e.id}）
- 标题: ${e.title}
- 分类: ${e.category}
- 内容: ${e.raw_content.slice(0,1500)}
---

请输出融合后的完整 Markdown：`;if(a.aiProvider==="DeepSeek"){const i=await fetch("https://api.deepseek.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${a.apiKey}`},body:JSON.stringify({model:"deepseek-chat",messages:[{role:"user",content:n}],temperature:.3})});if(!i.ok)throw new Error(`DeepSeek: ${i.status}`);return(g=(p=(c=(s=(o=(await i.json()).choices)==null?void 0:o[0])==null?void 0:s.message)==null?void 0:c.content)==null?void 0:p.trim())!=null?g:t}if(a.aiProvider==="Gemini"&&a.apiKey){const i=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${a.apiKey}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:n}]}],generationConfig:{temperature:.3}})});if(!i.ok)throw new Error(`Gemini: ${i.status}`);return(y=(h=(w=(u=(d=(f=(m=(await i.json()).candidates)==null?void 0:m[0])==null?void 0:f.content)==null?void 0:d.parts)==null?void 0:u[0])==null?void 0:w.text)==null?void 0:h.trim())!=null?y:t}return t}async function x(t,e){if(!e.category||e.category==="Inbox")return;const a=v(e.category);let n="";try{n=await $(t,a)}catch{}const r=await b(n,e);await k(t,a,r)}export{x as triggerWikiUpdate};
