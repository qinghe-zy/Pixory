sudo sed -i 's|"id": new_id|"id": new_id, "raw": counter|g' /home/qinghe/pixory-api/server.js
pm2 restart pixory-id