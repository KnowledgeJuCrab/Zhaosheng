# 校徽背景提取记录

输入：用户提供的 `微信图片_20261006215614_44_16.jpg`。

输出：`public/assets/qiqihar-medical-crest.png`，1254 × 1254 RGBA PNG。使用内置 imagegen 图像编辑工具完成一次背景提取，外部角落透明，内部白色图案保留。用于左侧环形目录中心，电脑端 72px、手机端 64px。

实际使用的提示词：

```text
Use case: background-extraction
Asset type: university crest cutout PNG for a website emblem.
Input images: Image 1 is the sole edit target, the supplied Qiqihar Medical University crest.
Primary request: Remove ONLY the white background OUTSIDE the outer circular blue badge, replacing that exterior with genuine transparent alpha.
Constraints: Preserve the original badge itself as exactly as possible. Keep its white interior disk and all white lettering fully opaque, because they are intrinsic parts of the emblem. Preserve the original Chinese text "齐齐哈尔医学院", English text "Qiqihar Medical University", digits "1946", blue outer ring, double helices, triangular blue motif and red dot. Preserve their exact arrangement, colors, shapes, relative proportions, lettering forms, existing texture, shading and outlines. Do not redraw or redesign the crest, do not correct or restyle any text, and do not change any interior pixels intentionally.
Composition/framing: The entire circular crest centered with a small transparent margin around its full perimeter; no cropping. Clean accurate transparent alpha edge following the outer badge boundary.
Avoid: No white or colored exterior background, no new text, no added shadows, borders, graphic elements or redesign. Do not make the internal white areas transparent.
```
