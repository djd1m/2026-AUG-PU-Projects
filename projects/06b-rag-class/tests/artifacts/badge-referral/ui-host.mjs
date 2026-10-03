import {createServer} from 'node:http';
createServer((req,res)=>{
 const u=new URL(req.url,'https://referral-host.test');
 if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const bot=u.searchParams.get('bot')??'referral0001';
 if(!/^[A-Za-z0-9_-]{12}$/.test(bot)){res.writeHead(400);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Внешний сайт</title><body><h1>Сайт владельца</h1><p>Настоящий виджет собственного бота</p><script src="https://n6b-ui.test/w.js" data-bot="'+bot+'" async></script></body></html>');
}).listen(3001,'0.0.0.0');
