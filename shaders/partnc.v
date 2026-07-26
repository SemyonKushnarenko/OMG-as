 varying vec2 vUv; 
 varying vec4 vColor;
 attribute vec4 c;
 void main() { 
  vUv = uv; 
  vColor = c;
  gl_Position = projectionMatrix *  vec4( position, 1.0,1.0 );
 }
