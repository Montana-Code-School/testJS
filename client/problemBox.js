var React = require('react');
var ReactDOM = require('react-dom');

var ExerciseList = React.createClass({

    render: function() {
    var exerciseData = this.props.data.map(function(exercise){
          if(exercise._id == '5661d0b2c8fdd09b12094aad'){
            return (
                <div className="well">
                <div><h1>{exercise.name}</h1></div>
                <div><h3> Solve this, idiot!: {exercise.problem}</h3></div>
                </div>
                )
            }
          })
        return (
            <div>
              {exerciseData}
            </div>
            );
    }
});



var Exercises = React.createClass({
    getInitialState: function(){
        return {data: []};
    },

    loadExercises: function(exercise) {

    $.ajax({
        url: this.props.url,
        dataType: 'json',
        cache: false,
        success: function(data){
            console.log("inside success")
            this.setState({data:data});
        }.bind(this),
        error: function(xhr, status, err){
            console.log("Broken url is " + this.props.url)
            console.error(this.props.url, status, err.toString());
        }.bind(this)
    });
},

componentDidMount: function(){
    this.loadExercises();
},


render: function() {
    return (
        <div>
        <ExerciseList data={this.state.data}/>
        </div>
        )
    }
})

ReactDOM.render(<Exercises url="/api/exercises/"/>, document.getElementById('exerciseBox'));
//module.exports = Exercises;
