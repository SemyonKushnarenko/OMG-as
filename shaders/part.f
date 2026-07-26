varying vec2 vUv;
varying vec4 vColor;

uniform sampler2D map;

void main() {
    vec4 c = texture2D( map, vUv );
    c.rgb *= vColor.rgb;
    gl_FragColor = c * vColor.a;
} 
