//Array exercises

//forEach

function ShowResults(value, index, ar) {

    console.log("value: " + value);

    console.log(" index: " + index);

    console.log("<br />");

}

var letters = ['ab', 'cd', 'ef'];

letters.forEach(ShowResults);

//Another forEach    

function arrayToUC(fruit){
    console.log(fruit.toUpperCase());
}
var fruit = ["apple", "pear", "mango"];
fruit.forEach(arrayToUC);

//map

var numbers = [12, 16, 18, 22];
var squareEm = function(number){
    console.log(number * number);
};

var newNum = numbers.map(squareEm);

//another map

var authFirst = ["Virginia", "Donna", "Stephen"];
var authLast = ["Woolf", "Tarrt", "King"];

var authName = function(first, last){
    console.log(first + " " + last);
};

authName(authFirst[0], authLast[0]);
authName(authFirst[2], authLast[2]);
authName(authFirst[2], authLast[0]);

//join with "-" and " "


var a = [0,1,2,3,4];
var b = a.join("-");
console.log(b);
console.log(a);

var names = ["Kelly", "Ed", "Trevor", "Travis"];
var withSpace = names.join(" ");
console.log(withSpace);

//trim

var message = "    abc def       ";

console.log("[" + message.trim() + "]");
console.log("<br/>");
console.log("length without trim method: " + message.length);
console.log("length after trim method: " + message.trim().length);


