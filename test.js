var exercise = [
    {
        "_id": "566f3efeb415832588344a88",
        "type": "Arrays",
        "name": "Math1",
        "problem": "1+1",
        "answer": "2",
        "user": null,
        "next": "566f3f08b415832588344a89",
        "prev": null,
        "__v": 2,
        "userAnswer": [
            {
                "_id": "566f3f51c690b14288ec8851",
                "exercise": "566f3efeb415832588344a88",
                "answer": "2",
                "pass": true,
                "user": "56673cbac3176bfe277be305",
                "__v": 0
            },
            {
                "_id": "566f4013c690b14288ec8852",
                "exercise": "566f3efeb415832588344a88",
                "answer": "3",
                "pass": false,
                "user": "56673cbac3176bfe277be305",
                "__v": 0
            }
        ]
    },
    {
        "_id": "566f3f08b415832588344a89",
        "type": "Arrays",
        "name": "Math2",
        "problem": "2+2",
        "answer": "4",
        "user": null,
        "next": null,
        "prev": "566f3efeb415832588344a88",
        "__v": 0,
        "userAnswer": []
    },
    {
        "_id": "566f5334992ee6808b9ed7dc",
        "answer": "4",
        "user": "566f4013c690b14288ec8852",
        "next": null,
        "prev": null,
        "__v": 0,
        "userAnswer": []
    }
]
var currentUser = "56673cbac3176bfe277be305";

var validExercises = [];

var allThings = function (data) {

  function userAnswerArray (datadata) {
    if(datadata.userAnswer.length > 0) {
      var userAnswers = datadata.userAnswer;
      return filterByUser(userAnswers);
    }
  }

  function filterByUser(answers) {
    for(var i = 0; i < answers.length; i++) {
      if(answers[i].pass === true && answers[i].user === currentUser) {
        validExercises.push(answers[i]);
        return validExercises;
      } else
      console.log('ERROR! ERROR! ERROR!')
    }
  }
  exercise.forEach(userAnswerArray);
  console.log(validExercises);
}

allThings(exercise);
