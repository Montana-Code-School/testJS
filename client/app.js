var React = require('react');
var ReactDOM = require('react-dom');
var Codemirror = require('./Codemirror');
var UserGrav = require('./userGrav');
var Exercises = require('./exercises');

require('codemirror/addon/lint/lint.js');
require('codemirror/addon/lint/javascript-lint.js');
require('codemirror/lib/codemirror.js');
require('codemirror/mode/javascript/javascript.js');
require('codemirror/mode/css/css.js');

var defaults = {
  javascript: 'Harold and doug',
};

var App = React.createClass({

  propTypes: {
    url: React.PropTypes.string.isRequired
  },

  getInitialState() {
    return {
      code: defaults.javascript,
      readOnly: false,
      mode: 'javascript',
      data: [],
      lint: true,
      exercises: [],
      currentExercise: null
    };
  },

  componentDidMount: function() {
    this.loadExercises();
  },

  managingExerciseState: function(){
    console.log(this.state.exercises, "Mounting the Exercises")
    var exerciseList = this.state.exercises.filter(function(exercise){
          return exercise.prev === null
        })
        console.log(exerciseList)
        if(exerciseList.length !== 0){
          //this.updateExerciseId(exerciseList[0]._id);
          this.setState({
            currentExercise: exerciseList[0]
          })
          console.log(exerciseList)
        }
  },

  loadExercises: function() {

    $.ajax({
      url: '/api/exercises/',
      dataType: 'json',
      cache: false,
      success: function(data) {
        console.log('Loaded exercises from server');
        this.setState({exercises: data});
        this.managingExerciseState();
      }.bind(this),
      error: function(xhr, status, err) {
        console.log('Broken url is ', '/api/exercises/');
        console.error(status, err.toString());
      }.bind(this)
    });
  },

  //currentExercise, exercises array
  getNextQuestion() {
    var nextExercise = this.state.exercises.filter(e => e._id === this.state.currentExercise.next);

    this.setState({
      currentExercise: nextExercise ? nextExercise[0] : null 
    });
  },

  getPrevQuestion() {

  },

  sendCodeToServer(code, exerciseId) {
    console.log(exerciseId)

    var answer = {answer: code};

    var exerciseId = '56709d0e31e15066ac69788b';

    $.ajax({
      url: this.props.url + exerciseId,
      dataType: 'json',
      cache: false,
      data: answer,
      type: 'POST',
      success: function(data) {
        alert('Your answer is ');
      },
      error: function(xhr, status, err) {
        console.error(status, err.toString());
      }
    });
  },

  updateCode(newCode) {
    this.setState({
      code: newCode
    });
  },
  changeMode(e) {
    var mode = e.target.value;
    this.setState({
      mode: mode,
      code: defaults[mode]
    });
  },
  toggleReadOnly() {
    this.setState({
      readOnly: !this.state.readOnly
    }, () => this.refs.editor.focus());
  },
  render() {
    var self = this;
    var options = {
      lineNumbers: true,
      mode: 'javascript',
      theme: 'midnight',
      gutters: ['CodeMirror-lint-markers'],
      lint: true,
    };
    return (
      <div>
        <Exercises data={this.state.currentExercise}  />
        <div className="container">
          <div className="col-md-8">
            <Codemirror ref="studentAnswer" type = "text" value={this.state.code} onChange={this.updateCode} options={options} />
          </div>
        </div>
          <button onClick={this.getPrevQuestion.bind(this, this.state.code)} type="submit" className="btn btn-default" id="handlePrev" disabled> Previous </button>
          <button onClick={this.sendCodeToServer.bind(this, this.state.code, this.state.exerciseId)} type="submit" className="btn btn-default" id="handleSubmit"> Submit </button>
          <button type="button" id="hint-button" className="btn btn-danger" data-toggle="popover" title="Hint" data-content="Heres a hint: ">Hint</button>
          <button onClick={this.getNextQuestion} type="submit" className="btn btn-default" id="handleNext"> Next </button>
      </div>
    );
  }
});

ReactDOM.render(<App url="/api/answer/" />, document.getElementById('my-app'));
