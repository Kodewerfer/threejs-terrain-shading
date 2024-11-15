import * as THREE from "three";

export default function makeTextureRepeat(texture: THREE.Texture, repeatTimes = 0) {
    if (repeatTimes > 0)
        texture.repeat.set(repeatTimes, repeatTimes);
    texture.wrapT = THREE.RepeatWrapping;
    texture.wrapS = THREE.RepeatWrapping;
}