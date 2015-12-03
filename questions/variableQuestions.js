//Variables

//JavaScript variables are containers for storing data values.  Variables can hold numbers, strings, arrays and objects.
var length = 16;                                    // Number
var lastName = "Smith";                             // String
var artists = ["Kahlo", "Picasso", "Hopper"];       // Array
var cost = ["12.00", "20.99", "27.49"];             // Array      
var madMan = {firstName:"Don", lastName:"Draper"};  // Object

//Variable values can be reassigned
var x = 12;
console.log("The value of x is currently " + x); //returns "The value of x is currently 12"
x = 199;
console.log("The value of x is now " + x); //returns "The value of x is now 199"

var madMan = {firstName:"Don", lastName:"Draper"}; 
console.log(madMan);  //returns Object {firstName: "Don", lastName: "Draper"}
madMan = {firstName:"Roger", lastName:"Stering"};
console.log(madMan);  //returns Object {firstName: "Roger", lastName: "Stering"}

//You can use variables to do math

var price1 = 15;
var price2 = 20;
var total = price1 + price2;  //returns 35
