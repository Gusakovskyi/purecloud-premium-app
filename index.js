var express = require('express');
var app = express();

app.use(express.static(__dirname+ '/docs'));


app.listen(process.env.PORT || 8080, () => console.log('Listening on 80'));
