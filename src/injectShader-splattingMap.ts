import * as THREE from "three";
import {TextureLoader} from "three";
import dedent from "dedent";
import makeTextureRepeat from "./utils.ts";
import GUI from "lil-gui";

export default function injectShaderSplattingMap(targetMaterial: THREE.MeshStandardMaterial, textureLoader: TextureLoader, gui: GUI, textureScaling = 15.0) {
    // set 2
    const baseColorTexture2 = textureLoader.load("terrainMaps/set2/Desert_Western_Ground_Gravel_Rock_vefmeccn_1K_BaseColor.jpg");
    baseColorTexture2.colorSpace = THREE.SRGBColorSpace;
    makeTextureRepeat(baseColorTexture2);
    
    const normalMapTexture2 = textureLoader.load("terrainMaps/set2/Desert_Western_Ground_Gravel_Rock_vefmeccn_1K_Normal.jpg");
    makeTextureRepeat(normalMapTexture2);
    
    const aoMapTexture2 = textureLoader.load("terrainMaps/set2/Desert_Western_Ground_Gravel_Rock_vefmeccn_1K_AO.jpg");
    makeTextureRepeat(aoMapTexture2, textureScaling);
    
    
    // set 3
    const baseColorTexture3 = textureLoader.load("terrainMaps/set3/Gravel_Ground_ukxmbcscw_1K_BaseColor.jpg");
    baseColorTexture3.colorSpace = THREE.SRGBColorSpace;
    makeTextureRepeat(baseColorTexture3);
    
    const normalMapTexture3 = textureLoader.load("terrainMaps/set3/Gravel_Ground_ukxmbcscw_1K_Normal.jpg");
    makeTextureRepeat(normalMapTexture3);
    
    const aoMapTexture3 = textureLoader.load("terrainMaps/set3/Gravel_Ground_ukxmbcscw_1K_AO.jpg");
    makeTextureRepeat(aoMapTexture3, textureScaling);
    
    
    // noise
    const perlinFineTexture = textureLoader.load("perlin-fine-1k.png");
    perlinFineTexture.wrapT = THREE.RepeatWrapping;
    perlinFineTexture.wrapS = THREE.RepeatWrapping;
    
    // splatting map
    const mat2Map = textureLoader.load("Landscape-flat_Terrain_mat2.png");
    mat2Map.flipY = false;
    
    const mat3Map = textureLoader.load("Landscape-flat_Terrain_mat3.png");
    mat3Map.flipY = false;
    
    const demoUniforms = {
        uUseNoTiling: new THREE.Uniform(false),
        uUseDepthMixing: new THREE.Uniform(false),
        uUseSplatteringMap: new THREE.Uniform(false),
    };
    
    gui.add(demoUniforms.uUseNoTiling, "value").name("Use NoTiling");
    gui.add(demoUniforms.uUseSplatteringMap, "value").name("Use Splatting");
    gui.add(demoUniforms.uUseDepthMixing, "value").name("Use Depth based Mixing");
    
    targetMaterial.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, demoUniforms);
        
        shader.uniforms.uNoiseFine = new THREE.Uniform(perlinFineTexture);
        
        // set 2
        shader.uniforms.uMap2 = new THREE.Uniform(baseColorTexture2);
        shader.uniforms.uNormalMap2 = new THREE.Uniform(normalMapTexture2);
        shader.uniforms.uAoMap2 = new THREE.Uniform(aoMapTexture2);
        
        // set 3
        shader.uniforms.uMap3 = new THREE.Uniform(baseColorTexture3);
        shader.uniforms.uNormalMap3 = new THREE.Uniform(normalMapTexture3);
        shader.uniforms.uAoMap3 = new THREE.Uniform(aoMapTexture3);
        
        // splatting map
        shader.uniforms.uMat2Map = new THREE.Uniform(mat2Map);
        shader.uniforms.uMat3Map = new THREE.Uniform(mat3Map);
        
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
            uniform sampler2D uNoiseFine;
            
            // splatting map
            uniform sampler2D uMat2Map;
            uniform sampler2D uMat3Map;
            
            //demo
            uniform bool uUseNoTiling;
            uniform bool uUseSplatteringMap;
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
                
                float perlinFineValue = texture(uNoiseFine, vUv).r;
                
                // cached splatting map values
                float M2_Fac = texture2D(uMat2Map,vUv).r;
                float M3_Fac = texture2D(uMat3Map,vUv).r;
            `
        );
        
        //  - diffused color
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_pars_fragment>',
            dedent`
            #include <map_pars_fragment>
            
            // new maps
            uniform sampler2D uMap2;
            uniform sampler2D uMap3;
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            dedent`
             #ifdef USE_MAP
                vec3 mapM1 =  textureNoTile(map, uNoiseFine, scaledUV);
                vec3 mapM2 =  textureNoTile(uMap2, uNoiseFine, scaledUV);
                
                vec3 mapMQ = uUseDepthMixing?mixDepthBased(vec4(mapM1,1.0-M2_Fac),vec4(mapM2,M2_Fac)):mix(mapM1,mapM2,M2_Fac);
                
                vec3 mapM3 =  textureNoTile(uMap3, uNoiseFine, scaledUV);
                
                vec3 mapMX= uUseDepthMixing? mixDepthBased(vec4(mapMQ,1.0-M3_Fac),vec4(mapM3,M3_Fac)):mix(mapMQ,mapM3,M3_Fac);
                
                if(!uUseSplatteringMap){
                    mapMX=mapM1;
                }
                
    
                vec4 sampledDiffuseColor = vec4(mapMX, 1.0);
            
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
            uniform sampler2D uNormalMap3;
            
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
                vec3 normalM1 =  textureNoTile(normalMap, uNoiseFine, scaledUV);//the "base normal map"
                vec3 normalM2 =  textureNoTile(uNormalMap2, uNoiseFine, scaledUV);
                
                vec3 normalMQ = uUseDepthMixing?mixDepthBased(vec4(normalM1,1.0-M2_Fac),vec4(normalM2,M2_Fac)):mix(normalM1,normalM2,M2_Fac);
                
                vec3 normalM3 =  textureNoTile(uNormalMap3, uNoiseFine, scaledUV);
                
                vec3 normalMX = uUseDepthMixing?mixDepthBased(vec4(normalMQ,1.0-M3_Fac),vec4(normalM3,M3_Fac)):mix(normalMQ,normalM3,M3_Fac);
                
                if(!uUseSplatteringMap){
                    normalMX=normalM1;
                }
                
                normalMX = normalMX * 2.0-1.0;
            
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
            uniform sampler2D uAoMap3;
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_fragment>',
            dedent`
            #ifdef USE_AOMAP
                    // AO map mixing
                    vec3 AoM1 = textureNoTile(aoMap, uNoiseFine, scaledUV); //the base Ao map
                    vec3 AoM2 = textureNoTile(uAoMap2, uNoiseFine, scaledUV);
                    
                    vec3 AoMQ = uUseDepthMixing?mixDepthBased(vec4(AoM1,1.0-M2_Fac),vec4(AoM2,M2_Fac)):mix(AoM1,AoM2,M2_Fac);
                    
                    vec3 AoM3 = textureNoTile(uAoMap3, uNoiseFine, scaledUV);
                    
                    float AoMX = uUseDepthMixing?mixDepthBased(vec4(AoMQ,1.0-M3_Fac),vec4(AoM3,M3_Fac)).r:mix(AoMQ,AoM3,M3_Fac).r;
                    
                    if(!uUseSplatteringMap){
                        AoMX=AoM1.r;
                    }
                    
                    float ambientOcclusion = (AoMX - 1.0) * aoMapIntensity + 1.0;
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
                
                // RO map mixing
                vec3 RoM1 =  textureNoTile(aoMap, uNoiseFine, scaledUV); //the base Ro map
                vec3 RoM2 =  textureNoTile(uAoMap2, uNoiseFine, scaledUV);
                
                vec3 RoMQ = uUseDepthMixing?mixDepthBased(vec4(RoM1,1.0-M2_Fac),vec4(RoM2,M2_Fac)):mix(RoM1,RoM2,M2_Fac);
                
                vec3 RoM3 =  textureNoTile(uAoMap3, uNoiseFine, scaledUV);
                
                vec3 RoMX = uUseDepthMixing?mixDepthBased(vec4(RoMQ,1.0-M3_Fac),vec4(RoM3,M3_Fac)):mix(RoMQ,RoM3,M3_Fac);
                
                  if(!uUseSplatteringMap){
                        RoMX=RoM1;
                    }
                
                vec4 texelRoughness = vec4( RoMX,.5 );
                
                // reads channel G, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
                roughnessFactor *=texelRoughness.g;
            #endif
            `
        );
    }
    
}