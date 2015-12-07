var React = require('react');
var ReactDOM = require('react-dom');
var PostExerciseBox = require('./postExerciseBox');

var ExerciseBox = React.createClass({
  propTypes: {
    url: React.PropTypes.string.isRequired
  },
  handleSubmit(e) {

    e.preventDefault();

    var name = ReactDOM.findDOMNode(this.refs.name).value.trim();
    var type = ReactDOM.findDOMNode(this.refs.type).value.trim();
    var problem = ReactDOM.findDOMNode(this.refs.problem).value.trim();
    var answer = ReactDOM.findDOMNode(this.refs.answer).value.trim();
    
    if (!problem) {
      return;
    }

    var data = ({problem: problem, answer: answer, name: name, type: type});

    $.ajax({
      url: this.props.url,
      dataType: 'json',
      data: data,
      type: 'POST',
      success: function(response) {
        console.log('posting data!', data, response);
        document.location = '/post_exercise';
      },
      error: function(xhr, status, err) {
        console.log('not posting data!');
        console.error(this.props.url, status, err.toString());
      }.bind(this)
    });
  },
  handleUpdate(id) {

    var problem = React.findDOMNode(this.refs.problem).value.trim();
    var answer = React.findDOMNode(this.refs.answer).value.trim();

    console.log(id);
    if (!problem) {
      return;
    }

    var data = ({problem: problem, answer: answer, name: name, type: type});

    $.ajax({
      url: this.props.url + id,
      dataType: 'json',
      data: data,
      type: 'PUT',
      success: function(response) {
        console.log('Updating Exercise!', data, response);
        document.location = '/post_exercise';
      },
      error: function(xhr, status, err) {
        console.log('Did not <update></update>!');
        console.error(this.props.url, status, err.toString());
      }.bind(this)
    });
  },

  render: function() {
    return (

    <div>
      <div className="col-sm-6 col-md-12">
        <h1>Enter New Exercises</h1>
      </div>

        <form>
          <div className="col-sm-6 col-md-6">
             <div className="form-group">
              <label>Exercise Name</label>
              <textarea rows="1" type="text" className="form-control" ref="name" placeholder="Exercise Name" />
            </div>
            <div className="form-group">
              <label>Exercise Category</label>
              <textarea rows="1" type="text" ref="type" className="form-control" placeholder="Exercise Type" />
            </div>
            <div className="form-group">
              <label>Exercise Problem</label>
              <textarea rows="10" type="text" className="form-control" ref="problem" placeholder="Exercise Problem" />
            </div>
            <div className="form-group">
              <label>Exercise Answer</label>
              <textarea rows="10" type="text" ref="answer" className="form-control" placeholder="Exercise Answer" />
            </div>
            <div className="form-group">
              <button onClick={this.handleSubmit} type="submit" className="btn btn-default"> Submit </button>
            </div>
          </div>
        </form>
    </div>
    );
  }
});

ReactDOM.render(<ExerciseBox url = "/api/exercises/"/>, document.getElementById('post-exercise'));
