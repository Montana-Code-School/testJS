var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require ('body-parser');

var router = express.Router();

router.use(bodyParser.urlencoded({extended: true}));

var Exercises = [];

router.route('/')

  .get(function(req, res) {
   mongoose.model('User').find({})
    .populate({ path:'comments', 
     populate:{ path:'user', select:'local.email local.username' }})
    .exec(function(err, users){
     if(err){
       return console.log(err);
     } else {
       var arrByTitle = blogs.filter(filterByTitle);
       res.json(arrByTitle);
     }
     
   });
})
​
 .post(function(req, res){
   var body = req.body.body;
​
   mongoose.model('User').create({
     body: body
   }, function(err, user){
     if(err){
       res.send("error")
     } else{
       console.log("New user named " + user + "created!");
       res.send(user);
     }
   });
 });
        // mongoose.model('Blog').findById({
        // _id: req.params.id
​
module.exports = router;