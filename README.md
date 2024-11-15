# Proof of concept - Threejs terrain shading

### From
[Imgur](https://imgur.com/UevkJ7C.png)
[Imgur](https://imgur.com/q3MEN7U.png)

## To
[Imgur](https://imgur.com/vsdRFHw.png)
[Imgur](https://imgur.com/3hgxFZq.png)

## Description

Texturing landscape, generated or otherwise, can be a bit tricky, baking the texture only works up to a certain point, if
the landscape is too large or complex, you'll be forced to choose between a blurry terrain or a gigantic file size.

This is a proof of concept for a shading solution that I found to be more approachable without too much sacrifice on performance.

The shading is done via modified built-in materials and the code structure is kept as simple as possible.

Some techniques like texture splattering, and pseudo texture bombing make the terrain more realistic.

There are two examples/methods,

- The first example uses only noise textures for mixing two sets of textures.

- The second one is a custom terrain mesh that is textured with 3 sets of textures mixed according to the splattering maps.

The code without additional uniforms that are used in the demo are in `src/pure`