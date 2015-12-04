//Functions

//A function is code that DOES SOMETHING. Think of it as a verb (this will make
  //more sense shortly).  A function has a name, parameters, and body.  The body
//is the code block surrounded by curly braces{}.  It's the code that "does"
//something.  Parameters are values passed to a function.  (Note: a parameter
  // is a variable, so you can name it whatever you want.)  These parameters are
//passed to the function's body, and a result is returned:

var thisIsTheNameOfTheFunction = function(parameter1, parameter2){
  return parameter1 + parameter2;
} 

//At the moment, the function above isn't doing anything.  It must be "called" 
//first.  You do this like so:

thisIsTheNameOfTheFunction(12, 100); //returns 112
