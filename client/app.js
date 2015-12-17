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
  javascript: 'Insert code here',
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
  getNextQuestion() {
    var nextExercise = this.state.exercises.filter(e => e._id === this.state.currentExercise.next);

    this.setState({
      currentExercise: nextExercise ? nextExercise[0] : null
    });
  },

  getPrevQuestion() {
    var prevExercise = this.state.exercises.filter(e => e._id === this.state.currentExercise.prev);

    this.setState({
      currentExercise: prevExercise ? prevExercise[0] : null
    });
  },
  managingExerciseState: function() {
    var exerciseList = this.state.exercises.filter(function(exercise) {
      return exercise.prev === null;
    });
    if (exerciseList.length !== 0) {
      this.setState({
        currentExercise: exerciseList[0]
      });
      console.log(exerciseList);
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

  sendCodeToServer(code) {
    var self = this;
    var answer = {answer: code};
    var exerciseId = this.state.currentExercise._id;
    var userExercise = this.state.currentExercise;
    $.ajax({
      url: this.props.url + exerciseId,
      dataType: 'json',
      cache: false,
      data: answer,
      type: 'POST',
      success: function(data) {
        var result = (data.pass === true ? 'correct!' : 'incorrect, try again!');
        if (data.pass){
          $(self.refs.alert).children().remove();
          $(self.refs.alert).append('<div></div>');
          $(self.refs.alert).children().append('<div class="alert alert-success alert-message" role="alert"><p>Correct!<p></div>')
        } else {
          $(self.refs.alert).children().remove();
          $(self.refs.alert).append('<div></div>');
          $(self.refs.alert).children().append('<div class="alert alert-danger alert-message" role="alert"><p> Incorrect, try again! <p></div>')
        }

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

    var disPrev = this.state.currentExercise ? (this.state.currentExercise.prev ? false : true) : true;
    var disNext = this.state.currentExercise ? (this.state.currentExercise.next ? false : true) : true;
    return (
      <div>
        <Exercises data={this.state.currentExercise} />
        <div className="container">
          <div className="" id="codeMirrorBox">
            <Codemirror ref="studentAnswer" type = "text" value={this.state.code} onChange={this.updateCode} options={options} />
          </div>
          </div>
          <div ref='alert'>
            <div></div>
          </div>
        <div id="codeMirrorButtons">
          <button onClick={this.getPrevQuestion.bind(this, this.state.code)} type="submit" className="btn btn-default" id="handlePrev" disabled={disPrev} > Previous </button>
          <button onClick={this.sendCodeToServer.bind(this, this.state.code)} type="submit" className="btn btn-default" id="handleSubmit"> Submit </button>
          <button onClick={this.getNextQuestion} type="submit" className="btn btn-default" id="handleNext" disabled={disNext} > Next </button>
          <button type="button" className="btn btn-danger" data-toggle="popover" title="Hint" data-content="Heres a hint: ">Hint</button>
        </div>
      </div>
    );
  }
});

ReactDOM.render(<App url="/api/answer/" />, document.getElementById('my-app'));
