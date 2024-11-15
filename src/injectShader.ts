import * as THREE from "three";
import {TextureLoader} from "three";
import dedent from "dedent";
import makeTextureRepeat from "./utils.ts";
import GUI from "lil-gui";

export default function injectShaderCode(targetMaterial: THREE.MeshStandardMaterial, textureLoader: TextureLoader, gui: GUI, textureScaling = 15.0) {
    // set 2
    const baseColorTexture2 = textureLoader.load("./static/terrainMaps/set2/Desert_Western_Ground_Gravel_Rock_vefmeccn_1K_BaseColor.jpg");
    baseColorTexture2.colorSpace = THREE.SRGBColorSpace;
    makeTextureRepeat(baseColorTexture2);
    
    const normalMapTexture2 = textureLoader.load("./static/terrainMaps/set2/Desert_Western_Ground_Gravel_Rock_vefmeccn_1K_Normal.jpg");
    makeTextureRepeat(normalMapTexture2);
    
    const aoMapTexture2 = textureLoader.load("./static/terrainMaps/set2/Desert_Western_Ground_Gravel_Rock_vefmeccn_1K_AO.jpg");
    makeTextureRepeat(aoMapTexture2, textureScaling);
    
    
    // noise
    const perlinTexture = textureLoader.load("./static/perlin-1k.png");
    perlinTexture.wrapT = THREE.RepeatWrapping;
    perlinTexture.wrapS = THREE.RepeatWrapping;
    
    const perlinFineTexture = textureLoader.load("./static/perlin-fine-1k.png");
    perlinFineTexture.wrapT = THREE.RepeatWrapping;
    perlinFineTexture.wrapS = THREE.RepeatWrapping;
    
    const demoUniforms = {
        uMixSecondTexture: new THREE.Uniform(false),
        uUseNoTiling: new THREE.Uniform(false),
        uUseDepthMixing: new THREE.Uniform(false),
    };
    
    gui.add(demoUniforms.uUseNoTiling, "value").name("Use NoTiling");
    gui.add(demoUniforms.uMixSecondTexture, "value").name("Add Second Texture");
    gui.add(demoUniforms.uUseDepthMixing, "value").name("Use Depth based Mixing");
    
    targetMaterial.onBeforeCompile = (shader) => {
        
        Object.assign(shader.uniforms, demoUniforms);
        
        shader.uniforms.uPerlin = new THREE.Uniform(perlinTexture);
        shader.uniforms.uNoiseFine = new THREE.Uniform(perlinFineTexture);
        
        // add set 2 texture as additional uniform data
        shader.uniforms.uMap2 = new THREE.Uniform(baseColorTexture2);
        shader.uniforms.uNormalMap2 = new THREE.Uniform(normalMapTexture2);
        shader.uniforms.uAoMap2 = new THREE.Uniform(aoMapTexture2);
        
        /*
         * vert shader
         * pass down the uv to frag shader
         */
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            dedent`
            #include <common>
            
            varying vec2 vUv;
            `
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            dedent`
            #include <begin_vertex>
            
            vUv = uv;
            `
        );
        
        /*
         * frag shader
         */
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            dedent`
            #include <common>
            
            //get the uv
            varying vec2 vUv;
            
            // noise uniforms
            uniform sampler2D uPerlin;
            uniform sampler2D uNoiseFine;
            
            //demo
            uniform bool uUseNoTiling;
            uniform bool uMixSecondTexture;
            uniform bool uUseDepthMixing;
            `
        );
        
        // - add util functions and newUV
        shader.fragmentShader = shader.fragmentShader.replace(
            'void main() {',
            dedent`
            
            // used a more efficient version of the method from here: https://iquilezles.org/articles/texturerepetition/
            // for this to work best, the second param should be a really fine grit noise texture
            float sum(vec3 v) { return v.x+v.y+v.z; }
            vec3 textureNoTile(sampler2D iChannel0, sampler2D iChannel1, vec2 x)
            {
                
                float k = texture(iChannel1, 0.0025*x.xy).x; // cheap (cache friendly) lookup
                float l = k*8.0;
                float f = fract(l);
                
                float ia = floor(l+0.5); // suslik's method
                float ib = floor(l);
                f = min(f, 1.0-f)*2.0;
                
                vec2 offa = sin(vec2(3.0,7.0)*ia); // can replace with any other hash
                vec2 offb = sin(vec2(3.0,7.0)*ib); // can replace with any other hash
                
                vec4 cola = texture(iChannel0, vec2(x.xy + offa));
                vec4 colb = texture(iChannel0, vec2(x.xy + offb));
                
                if(!uUseNoTiling){
                    return texture(iChannel0, x).xyz;
                }
                
                return mix(cola, colb, smoothstep(0.2,0.8,f-0.1*sum(cola.xyz-colb.xyz))).xyz;
            }
            
            // mix two textures based on depth
            // far better looking than mix()
            vec3 mixDepthBased(vec4 texture1, vec4 texture2 )
            {
               float depth = 0.2;
               float ma = max(texture1.a, texture2.a) - depth;

               float b1 = max(texture1.a - ma, 0.0);
               float b2 = max(texture2.a - ma, 0.0);

               return (texture1.rgb * b1 + texture2.rgb * b2) / (b1 + b2);
            }
            
            void main(){
            
                // scaling using uv/ or using texture.repeat
                vec2 scaledUV = vUv;
                scaledUV.x*=${textureScaling}.0;
                scaledUV.y*=${textureScaling}.0;
                
                
                float perlinValue = texture(uPerlin, vUv).r;
                float perlinFineValue = texture(uNoiseFine, vUv).r;
            `
        );
        
        //  - diffused color
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_pars_fragment>',
            dedent`
            #include <map_pars_fragment>
            
            // new maps
            uniform sampler2D uMap2;
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            dedent`
             #ifdef USE_MAP
                vec3 mapM1 = textureNoTile(map, uNoiseFine, scaledUV);
                vec3 mapM2 = textureNoTile(uMap2, uNoiseFine, scaledUV);
                
                vec3 mapMX= uUseDepthMixing?mixDepthBased(vec4(mapM1, 1.0-perlinValue), vec4(mapM2, perlinValue)):mix(mapM1, mapM2, perlinValue);
    
                vec4 sampledDiffuseColor = vec4(uMixSecondTexture?mapMX:mapM1, 1.0);
            
            #ifdef DECODE_VIDEO_TEXTURE
                sampledDiffuseColor.rgb = pow(sampledDiffuseColor.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4));
                sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * 0.0773993808, lessThanEqual(sampledDiffuseColor.rgb, vec3(0.04045)));
            #endif
                diffuseColor *= sampledDiffuseColor;
            #endif
            `
        );
        
        // -normal map
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normalmap_pars_fragment>',
            dedent`
            #include <normalmap_pars_fragment>
            
            // new normal map
            uniform sampler2D uNormalMap2;
            `);
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            dedent`
            // only tangent space normal map will work.
            #ifdef OBJECTSPACE_NORMALMAP
                vec3 normal = texture2D(normalMap, scaledUV).xyz * 2.0 - 1.0; // overrides both flatShading and attribute normals
            
                #ifdef FLIP_SIDED
                    normal = -normal;
                #endif
            
                #ifdef DOUBLE_SIDED
                    normal = normal * faceDirection;
                #endif
            
                normal = normalize(normalMatrix * normal);
            #elif defined( USE_NORMALMAP_TANGENTSPACE )
            
                // Normal map mixing
                vec3 normalM1 = textureNoTile(normalMap, uNoiseFine, scaledUV);//the "base normal map"
                vec3 normalM2 = textureNoTile(uNormalMap2, uNoiseFine, scaledUV);
                
                vec3 normalMX = uUseDepthMixing? mixDepthBased(vec4(normalM1, 1.0-perlinValue), vec4(normalM2, perlinValue)):mix(normalM1, normalM2, perlinValue);
                if(!uMixSecondTexture){
                    normalMX=normalM1;
                }
                normalMX*= 2.0-1.0;
            
                #ifdef USE_TANGENT
                    normal = normalize(tbn * normalMX);
                #else
                    normal = perturbNormal2Arb(-vViewPosition, normal, normalMX, faceDirection);
                #endif
            #elif defined(USE_BUMPMAP)
                normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
            #endif
            `);
        
        
        // -AO map
        // also handle the roughness map, using g channel of AoMap for roughness, r for AO.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_pars_fragment>',
            dedent`
            #include <aomap_pars_fragment>
            
            //new ao map
            uniform sampler2D uAoMap2;
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_fragment>',
            dedent`
            #ifdef USE_AOMAP
            
                    // AO map mixing
                    vec3 AoM1 = textureNoTile(aoMap, uNoiseFine, scaledUV); //the base Ao map
                    vec3 AoM2 = textureNoTile(uAoMap2, uNoiseFine, scaledUV);
                    
                    vec3 AoMX = uUseDepthMixing? mixDepthBased(vec4(AoM1, 1.0-perlinValue), vec4(AoM2, perlinValue)):mix(AoM1, AoM2, perlinValue);
                    if(!uMixSecondTexture){
                        AoMX=AoM1;
                    }
                    
                    float ambientOcclusion = (AoMX.r - 1.0) * aoMapIntensity + 1.0;
                    reflectedLight.indirectDiffuse *= ambientOcclusion;
                    
                #if defined( USE_CLEARCOAT )
                     clearcoatSpecularIndirect *= ambientOcclusion;
                #endif

                #if defined( USE_SHEEN )
                     sheenSpecularIndirect *= ambientOcclusion;
                #endif

                #if defined( USE_ENVMAP ) && defined( STANDARD )
                    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
                    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
                #endif
            #endif
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            dedent`
            float roughnessFactor = roughness;

            #ifdef USE_AOMAP
                // // RO map mixing
                vec3 RoM1 = textureNoTile(aoMap, uNoiseFine, scaledUV); //the base Ro map
                vec3 RoM2 = textureNoTile(uAoMap2, uNoiseFine, scaledUV);

                vec3 RoMX = mixDepthBased(vec4(RoM1, 1.0-perlinValue), vec4(RoM2, perlinValue));
                if(!uMixSecondTexture){
                    RoMX=RoM1;
                }

                // reads channel G, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
                roughnessFactor *=RoMX.g;
            #endif
            `
        );
        // material.userData.shader = shader
    }
    
}