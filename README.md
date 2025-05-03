# Examples Extension

A simple example MediaWiki extension that adds a special page saying hello, now featuring flying sunflowers and tulips that explode on collision with appropriate sounds! Also includes background animations, a sun, and clouds.

## Features

*   Displays "Hello from the Examples extension!" in Comic Sans MS.
*   Animates sunflowers and tulips flying across the page.
*   Flowers appear at random intervals and move at random speeds.
*   When flowers collide, they explode into parts.
*   Different sounds play based on collision type:
    *   Sunflower + Sunflower: Whale sound
    *   Tulip + Tulip: Squeak sound
    *   Sunflower + Tulip: Explosion sound
*   Phasing green background for the content area (ground).
*   Phasing blue background for header/footer/sidebar (sky).
*   Pulsating sun in the corner.
*   Floating clouds near the top.

## Installation

1.  Clone this extension into your `extensions/Examples` directory.
2.  **Important:** Place the following sound files (e.g., in `.mp3` or `.wav` format) inside the `extensions/Examples/modules/` directory:
    *   `explosion.mp3` (for mixed collisions)
    *   `whale.mp3` (for sunflower collisions)
    *   `squeak.mp3` (for tulip collisions)
    *   *(Ensure the filenames match those in `ext.examples.hello.js` or update the script)*
3.  Add to your `LocalSettings.php`:
    ```php
    wfLoadExtension( 'Examples' );
    ```
4.  Visit `Special:ExamplesHello` on your wiki.
