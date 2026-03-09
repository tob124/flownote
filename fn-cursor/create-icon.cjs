const fs = require('fs');
const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
fs.writeFileSync('app-icon.png', Buffer.from(base64, 'base64'));
console.log('Created app-icon.png');
