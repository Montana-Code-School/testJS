// var data = [
// 	users: [{
// 		user: {name: "dooug", email: "e.e@e", completedChallanged: [{}]},
// 		user: {name: "kelly", email: "e.e@e", completedChallanged: [{}]},
// 		user: {name: "travis", email: "e.e@e", completedChallanged: [{}]},
// 		user: {name: "ed", email: "e.e@e", completedChallanged: [{}]},
// 	}],
// 	exercises: [{
// 		exercise: {name: "challenge 1", problem: "Create a variable where the sum of 4 numbers equals 11.",}
// 	}]
// ]


var Sandbox = require('../lib/sandbox');
var s = new Sandbox();
// Example 1 - Standard JS
s.run( '1 + 1', function( output ) {
  console.log( 'Example 1: ' + output.result + '\n' );
});
