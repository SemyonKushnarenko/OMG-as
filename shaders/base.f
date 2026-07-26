varying vec2 vUv;
uniform sampler2D map;
uniform vec3 color;
uniform float opacity;

void main() {
    vec4 c = texture2D( map, vUv );
    c.rgb *= color;
    gl_FragColor = c * opacity;
} 
