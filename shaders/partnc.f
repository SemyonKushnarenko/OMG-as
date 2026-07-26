varying vec2 vUv; 

uniform sampler2D map;

void main() {
    vec4 c = texture2D( map, vUv );
    gl_FragColor = c;
} 
