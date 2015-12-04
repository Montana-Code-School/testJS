//Strings

//Methods: toUpperCase, toLowerCase, slice, indexOf, lastIndexOf, charAt

//toUpperCase(), toLowerCase(), length
//The toUpperCase() method returns the string value converted to uppercase: str.toUpperCase()

//The toLowerCase() method returns the string value converted to lowercase: str.toLowerCase()

//The length property represents the length of a string. For an empty string, length is 0.  str.length

var title = "To Kill a Mockingbird";
console.log(title.toUpperCase()); //returns "TO KILL A MOCKINGBIRD"
console.log(title.toLowerCase()); //returns "to kill a mockingbird"
console.log(title.length); //returns 21

//string.slice(beginSlice[, endSlice])
var exampleString = "This is a string.";
console.log(exampleString.slice(5, 10)); //returns "is a"

//string.indexOf()
//str.indexOf(searchValue[, fromIndex])
//The indexOf() method returns the index within the String object of the first occurrence of the specified value, starting the search at fromIndex (or 0, if no value is given for fromIndex). The method returns -1 if the value is not found.

var indexOfString = "This is our test string for the indexOf method."
console.log(indexOfString.indexOf('test')); //answer is '12'
console.log(indexOfString.indexOf('This')); //answer is '0'
console.log(indexOfString.indexOf('is')); //answer is '2'
console.log(indexOfString.indexOf('blue')); //answer is '-1', meaning the value was not found

//string.lastIndexOf()
//str.lastIndexOf(searchValue[, fromIndex])
//The lastIndexOf() method returns the index within the calling String of the last occurrence of the specified value, or -1 if not found. The calling string is searched backward, starting at fromIndex.

var lastIndexOfString = "banana"
console.log(lastIndexOfString.lastIndexOf('a')); //answer is 5
console.log(lastIndexOfString.lastIndexOf('a', 2)); //answer is 1
console.log(lastIndexOfString.lastIndexOf('a', 4)); //answer is 3
console.log(lastIndexOfString.lastIndexOf('z')); //answer is -1, since the letter 'z' is not found in the word 'banana'

//The charAt() method returns the specified character from a string. Characters in a string are indexed from left to right. The index of the first character is 0, and the index of the last character in a string called stringName is stringName.length - 1. If the index you supply is out of range, JavaScript returns an empty string.
//str.charAt(index)

var newString = "Remember that all strings begin at index 0.";
console.log("The character at index 0 is '" + newString.charAt(0) + "'"); //answer is 'R'
console.log("The character at index 1 is '" + newString.charAt(1) + "'"); //answer is 'e'
console.log("The character at index 7 is '" + newString.charAt(7) + "'"); //answer is 'r'
console.log("The character at index 42 is '" + newString.charAt(42) + "'"); //answer is '.'

//Concatenation (Note: while there is a concat() method, MDN highly recommends against using it.)

var firstName = "Joe";
var lastName = "Doe";
var fullName = function(a,b){
    console.log(a + " " + b);
}

fullName(firstName, lastName); //returns "Joe Doe"

//String concatenation and using array indexes
var authFirst = ["Virginia", "Donna", "Stephen"];
var authLast = ["Woolf", "Tarrt", "King"];

var authName = function(first, last){
    console.log(first + " " + last);
};

authName(authFirst[0], authLast[0]); //returns Virginia Woolf
authName(authFirst[2], authLast[2]); //returns Stephen King
authName(authFirst[2], authLast[0]); //returns Stephen Woolf