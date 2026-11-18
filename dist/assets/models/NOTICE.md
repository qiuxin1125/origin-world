# Character artwork used by the Origin visual demo

The demo uses three **third-party VRoid Studio sample models**, not original or exclusive Origin characters:

| Demo file | Original model | Embedded license |
| --- | --- | --- |
| garden-muse.vrm | HairSample_Female | CC0 |
| shore-wanderer.vrm | HairSample_Male | CC0 |
| letter-keeper.vrm | Vivi (VRoid beta sample) | CC0 |

Original sample artwork: VRoid Project / pixiv Inc. Downloaded from the [madjin/vrm-samples mirror](https://github.com/madjin/vrm-samples/tree/master/vroid/beta). These files retain their embedded VRM metadata, including `licenseName: CC0` and permissions allowing everyone and commercial use. See `SOURCES.json` for exact source paths, original and optimized checksums and preserved metadata.

The [official VRoid FAQ](https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use) identifies HairSample_Female, HairSample_Male and the beta sample characters as CC0. [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

Web optimization: embedded color textures are limited to 1024 pixels, normal maps and thumbnails to 512 pixels; PNG recompression and duplicate binary-content deduplication. Meshes, expressions, skeletons and license metadata are preserved. Animation, placement and role names are supplied by this demonstration. This is not an endorsement by pixiv.

Runtime dependencies:

- Three.js 0.180.0, MIT; see `dist/vendor/three/LICENSE`.
- `@pixiv/three-vrm` 3.4.4, MIT; see `dist/vendor/three-vrm/LICENSE`.
- `GLTFLoader.js` and `BufferGeometryUtils.js` are from Three.js 0.180.0, under its MIT license.
