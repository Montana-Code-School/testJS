var http 		= require('http'),
 express        = require('express'),   
 port           = process.env.PORT || 8010,
 app        = express();  

app.use(express.static('public'));

app.listen(port);
console.log('Magic happens on port ' + port);

