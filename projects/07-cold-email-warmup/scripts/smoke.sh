set -e
B=${B:-http://127.0.0.1:3001}
B=http://127.0.0.1:3001
R1=$(curl -s -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"email":"demo-smoke@course.local","password":"demo-password-1"}')
echo "REGISTER: $(echo $R1 | head -c 120)"
A=$(echo $R1 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).access))")
echo "TOKEN: ${A:0:24}..."
R2=$(curl -s -X POST $B/api/domains -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"name":"warm-out-local.example"}')
echo "DOMAIN: $(echo $R2 | head -c 200)"
DID=$(echo $R2 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).domain.id))")
R3=$(curl -s -X POST $B/api/mailboxes -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d "{\"domain_id\":\"$DID\",\"address\":\"sales-1112@warm-out-local.example\",\"smtp_host\":\"smtp.seed.local\",\"smtp_port\":465,\"imap_host\":\"imap.seed.local\",\"imap_port\":993,\"login\":\"sales\",\"password\":\"app-pass-1\"}")
echo "MAILBOX: $(echo $R3 | head -c 220)"
MID=$(echo $R3 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).mailbox.id))")
R4=$(curl -s -X POST $B/api/mailboxes/$MID/pool -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"consent":true,"consent_version":"pool-consent-v1"}')
echo "POOL JOIN: $(echo $R4 | head -c 120)"
R5=$(curl -s -X POST $B/api/campaigns -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"name":"Смоук-кампания","mailbox_ids":["'$MID'"],"recipients_csv":"email,first_name\nbuyer@one.example,Иван\nabuse@dupe.example,X","steps":[{"offset_days":0,"template":"Привет, {{first_name}}!"},{"offset_days":3,"template":"Напомню, {{first_name}}"}]}')
echo "CAMPAIGN: $(echo $R5 | head -c 140)"
CID=$(echo $R5 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).campaign.id))")
R6=$(curl -s -X POST $B/api/campaigns/$CID/recipients -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"csv":"email,first_name\nbuyer@one.example,Иван\nwatch@two.example,Пётр"}')
echo "IMPORT: $R6"
R7=$(curl -s -X POST $B/api/campaigns/$CID/launch -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"consent_text_version":"launch-consent-v1 (от имени моих ящиков)","ru_recipients_ack":false}')
echo "LAUNCH: $R7"
sleep 2
R8=$(curl -s $B/api/campaigns -H "Authorization: Bearer $A")
echo "LIST: $(echo $R8 | head -c 220)"
R9=$(curl -s -X POST $B/api/billing/checkout -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"plan":"base","currency":"RUB"}')
echo "CHECKOUT(demo): $(echo $R9 | head -c 160)"
R10=$(curl -s -X POST $B/api/webhooks/yookassa -H 'Content-Type: application/json' -d '{"metadata":{"user_ref":"'"$(echo $R1 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).user.id))")"'","plan":"base"}}')
echo "WEBHOOK(demo): $R10"
R11=$(curl -s $B/api/pool/public)
echo "POOL PUBLIC: $R11"
R12=$(curl -s "$B/api/health/$DID" -H "Authorization: Bearer $A")
echo "HEALTH: $(echo $R12 | head -c 260)"
