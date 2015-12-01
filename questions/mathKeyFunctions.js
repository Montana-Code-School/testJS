//Create a variable that creates a random number between 1-10
var mathRandom = Math.random()*11;
console.log(mathRandom);

//Use your previous variable to round UP to the nearest whole number
var roundUp = Math.ceil(mathRandom);
console.log(roundUp);

//Use your random variable to round DOWN to the nearest whole number.
var roundDown = Math.floor(mathRandom);
console.log(roundDown);

//Use your random variable to round to the nearest whole number.
var round = Math.round(mathRandom);
console.log(round);

//Create a variable that multiplies 4 to the power 3.
var power = Math.pow(4,3);
console.log(power);

//Create a variable that finds the square root of 124.
var squareRoot = Math.sqrt(144);
console.log(squareRoot);

//Create a variable that multiplies the square root of 124 by pi
var pi = Math.PI*squareRoot;
console.log(pi);

//Find the lowest value in the following list of numbers using the Math method.
console.log(Math.min(9, 1, 3, 4, 27, 1920, -1, 0, -2, -4, 23, 12, 43, -17, -3, 14, -20, 20, 27));

//Find the highest value in the following list of numbers using the Math method.
console.log(Math.max(23, 1, -99, 120, -265, 32, 11, 42, 12, 13, 62, 79, 39, -72, 9, -10, 0, -19));
