var http 		= require('http');
var express     = require('express');   
var port        = process.env.PORT || 8010;
var app         = express();  
var mongoose    = require('mongoose');
var passport    = require('passport');
var flash       = require('connect-flash');

var morgan       = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');

var configDB = require('./config/database.js');

//mongoose.connect(configDB.url);

require('./config/passport')(passport);

app.use(morgan('dev')); 
app.use(cookieParser());
app.use(bodyParser.json()); // get information from html forms
        app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');

app.use(session({ secret: 'JavascriptCodeTesting' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

require('./routes/userLoginRoutes.js')(app, passport);

app.use(express.static('public'));

app.listen(port);
console.log('Magic happens on port ' + port);

