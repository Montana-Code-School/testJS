function drawAllToCanvas () {
        window.requestAnimFrame = (function(callback) {
          return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame ||
            function(callback) {
              window.setTimeout(callback, 1000 / 60);
            };
        })();

        var c = document.getElementById("myCanvas");
        var ctx = c.getContext("2d");
        var r = 200;

        var start = {
          x: 210,
          y: 280
        };

        var myLine = {
          x: c.width / 4,
          y: c.height / 2,
          width: 30,
          height: 2,
          borderWidth: 2
        }
        

        ctx.lineWidth = 4;
        ctx.strokeStyle = 'tomato';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'silver';

        function drawLineAcross () {

          function drawLine (myLine, ctx) {
           
            ctx.beginPath();
            ctx.moveTo((start.x + r), start.y);
            ctx.rect(myLine.x, myLine.y, myLine.width, myLine.height);
            ctx.lineWidth = myLine.borderWidth;
            ctx.stroke();

          }

          function animate(myline, c, ctx, startTime) {

            var time = (new Date()).getTime() - startTime;
            var linearSpeed = 1000;
            var newX = linearSpeed * time / 1000;
              if(newX < c.width - myLine.width - myLine.borderWidth / 2) {
                myLine.x = newX;
              }

            drawLine(myLine, ctx);

            requestAnimFrame(function() {
              animate(myLine, c, ctx, startTime);
            });
            }

            drawLine(myLine, ctx);

            // wait one second before starting animation
            setTimeout(function() {
            var startTime = (new Date()).getTime();
            animate(myLine, c, ctx, startTime);
            }, 5);
        }

        function drawCircle () {
          var end = 190;
          var cur = 0;
          var counterClockwise = false;
          var circ = Math.PI * 2;
          var quart = Math.PI / 220;

          function animate(current) {
            ctx.beginPath();
            ctx.arc(start.x, start.y, r, -(quart), ((circ) * current) - quart, false);
            ctx.stroke();
              cur++;
              if (cur < end) {
                requestAnimFrame(function () {
                animate(cur / 90)
                });
              } else {
                
                drawLogo();

                  function drawLogo() {
                    logo = new Image();
                    logo.src = 'imgs/learnJS.png';
                    logo.onload = function(){
                      ctx.drawImage(logo, 396, 80);
                    }
                  }
                drawLineAcross();
              }
          }
          animate();
        }
        drawCircle();
      };
      drawAllToCanvas();

// module.exports =  drawAllToCanvas();