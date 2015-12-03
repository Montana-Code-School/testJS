//Array exercises

//Using length property, push(), pop(), shift(), unshift(), splice(), 
//sort(), reverse(), toString(), forEach, join(), map(), trim()



//Definition: JavaScript arrays are used to store multiple values in a single variable.
//An example would be...

var students = ["Kim", "Dave", "Mark", "Jen"];

//Arrays have a zero-based index.  You refer to an array element by referring to the index number.

console.log(students[0]); //returns "Kim"
console.log(students[1]); //returns "Dave"
console.log(students[2]); //returns "Mark"
console.log(students[3]); //returns "Jen"

//To find the length of an array, use the length property:

students.length;  // the length of students is 4

//Adding array elements using push()

students.push("Larry");  // adds a new element (Larry) to the END of the students array

//The pop() method removes the last element from an array:

students.pop();  //Removes the last element ("Larry") from the students array

//The shift() method removes the first element of an array, and "shifts" all other elements one place up.

students.shift(); //Removes the first element ("Kim") from the array.  "Dave" is now at index[0]

//The unshift() method adds a new element to an array (at the beginning), and "unshifts" older elements:

students.unshift("Travis");

//The splice() method can be used to ADD new items to an array:

students = ["Travis", "Kim", "Dave", "Mark", "Jen"];
students.splice(2, 0, "Nora", "Doug");

//The first parameter (2) defines the position where new elements should be added (spliced in).
//The second parameter (0) defines how many elements should be removed.
//The rest of the parameters ("Nora" , "Doug") define the new elements to be added.

//The splice() method can also be used to REMOVE items from an array:

students.splice(0, 1);  // Removes the first element of students ("Travis")

//The first parameter (0) defines the position where new elements should be removed (spliced out).
//The second parameter (1) defines how many elements should be removed.

//The sort() method sorts an array alphabetically:

students.sort();
console.log(students);  //returns ["Dave", "Doug", "Jen", "Kim", "Mark", "Nora"]

//The reverse() method reverses the elements in an array.

students.reverse();
console.log(students); //returns ["Nora", "Mark", "Kim", "Jen", "Doug", "Dave"]

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

//map()

var numbers = [12, 16, 18, 22];
var squareEm = function(number){
    console.log(number * number);
};

var newNum = numbers.map(squareEm);

//another map()

var authFirst = ["Virginia", "Donna", "Stephen"];
var authLast = ["Woolf", "Tarrt", "King"];

var authName = function(first, last){
    console.log(first + " " + last);
};

authName(authFirst[0], authLast[0]);
authName(authFirst[2], authLast[2]);
authName(authFirst[2], authLast[0]);

//The toString() method converts an array to a string of (comma separated) array values.

students.toString(); //returns Nora,Mark,Kim,Jen,Doug,Dave

//Join() with "-" and " "

var a = [0,1,2,3,4];
var b = a.join("-");
console.log(a); //returns [0, 1, 2, 3, 4]
console.log(b); //returns 0-1-2-3-4

var names = ["Kelly", "Ed", "Trevor", "Travis"];
var withSpace = names.join(" ");
console.log(withSpace); //returns "Kelly Ed Trevor Travis"

//trim()

var message = "    abc def       ";

console.log("[" + message.trim() + "]");
console.log("<br/>");
console.log("length without trim method: " + message.length);
console.log("length after trim method: " + message.trim().length);


