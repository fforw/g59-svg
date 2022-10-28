const Yargs = require('yargs')
    .option('width', {
        alias: 'w',
        describe: 'SVG width',
        number: true
    })
    .option('height', {
        alias: 'h',
        describe: 'SVG height',
        number: true
    })
    // .option('reference', {
    //     alias: 'r',
    //     describe: 'Reference image for dimension',
    // })
    // .option('color', {
    //     alias: 'c',
    //     describe: 'Color to draw lines with',
    // })
    .default("width", 5120, "default width")
    .default("height", 2880, "default width")
    .help();

const fs = require("fs")
const { voronoi } = require("d3-voronoi")
const { createCanvas } = require("canvas")
// noinspection ES6UnusedImports

const PHI = (1 + Math.sqrt(5)) / 2;
const TAU = Math.PI * 2;
const DEG2RAD_FACTOR = TAU / 360;

const config = {
    width: 0,
    height: 0,
    palette: ["#000", "#fff"],
    bg: "#000",
    directions: [0, TAU/2]
};


const LUM_THRESHOLD = 0.03928;

const PERCEPTIVE_FACTOR_RED = 0.2126;
const PERCEPTIVE_FACTOR_GREEN = 0.7152;
const PERCEPTIVE_FACTOR_BLUE = 0.0722;

function gun_luminance(v)
{

    if (v <= LUM_THRESHOLD)
    {
        return v / 12.92
    }
    else
    {
        return Math.pow(((v + 0.055) / 1.055), 2.4);
    }
}



const colorRegExp = /^(#)?([0-9a-f]+)$/i;

function hex(n)
{
    const s = n.toString(16);

    return s.length === 1 ? "0" + s : s;
}

function hue2rgb(p, q, t){
    if(t < 0) t += 1;
    if(t > 1) t -= 1;
    if(t < 1/6) return p + (q - p) * 6 * t;
    if(t < 1/2) return q;
    if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
}

function getLuminance(color)
{
    //const c = Color.validate(color);
    return PERCEPTIVE_FACTOR_RED * gun_luminance(color.r) + PERCEPTIVE_FACTOR_GREEN * gun_luminance(color.g) + PERCEPTIVE_FACTOR_BLUE * gun_luminance(color.b);
}


class Color
{
    r;
    g;
    b;

    constructor(r,g,b)
    {
        this.r = r;
        this.g = g;
        this.b = b;
    }

    mix(other, ratio, out)
    {
        if (!out)
        {
            out = new Color();
        }
        out.r = (this.r + (other.r - this.r) * ratio)|0;
        out.g = (this.g + (other.g - this.g) * ratio)|0;
        out.b = (this.b + (other.b - this.b) * ratio)|0;

        return out;
    }

    multiply(n, out)
    {
        if (!out)
        {
            out = new Color();
        }

        out.r = this.r * n;
        out.g = this.g * n;
        out.b = this.b * n;
        return out;
    }

    scale(r, g, b, out)
    {
        if (!out)
        {
            out = new Color();
        }

        out.r = this.r * r;
        out.g = this.g * g;
        out.b = this.b * b;

        return out
    }

    set(r, g, b)
    {
        if (r instanceof Color)
        {
            this.r = r.r;
            this.g = r.g;
            this.b = r.b;

        }
        else
        {
            this.r = r;
            this.g = g;
            this.b = b;
        }
        return this;
    }

    toRGBHex()
    {
        return "#" + hex(this.r) + hex(this.g) + hex(this.b );
    }

    toRGBA(alpha)
    {
        return "rgba(" + (this.r) + "," + (this.g) + "," + (this.b ) + "," + alpha + ")";
    }

    toHex()
    {
        return (this.r << 16) + (this.g << 8) + this.b;
    }

    static validate(color)
    {

        let m;
        if (typeof color !== "string" || !(m = colorRegExp.exec(color)))
        {
            return null;
        }
        const col = m[2];

        if (col.length === 3)
        {
            return new Color(
                parseInt(col[0], 16) * 17,
                parseInt(col[1], 16) * 17,
                parseInt(col[2], 16) * 17
            )
        }
        else if (col.length === 6)
        {
            return new Color(
                parseInt(col.substring(0, 2), 16),
                parseInt(col.substring(2, 4), 16),
                parseInt(col.substring(4, 6), 16)
            )
        }
        else
        {
            return null;
        }
    }

    static from(color, factor = 1.0)
    {
        if (Array.isArray(color))
        {
            const length = color.length;
            const array = new Float32Array(length * 3);

            const f = factor/255;

            let off = 0;
            for (let i = 0; i < length; i++)
            {
                const col = Color.from(color[i]);
                array[off++] = col.r * f;
                array[off++] = col.g * f;
                array[off++] = col.b * f;
            }

            return array;
        }

        const col = Color.validate(color);

        if (!col)
        {
            throw new Error("Invalid color " + color);
        }

        col.r *= factor;
        col.g *= factor;
        col.b *= factor;

        return col;
    }

    static fromHSL(h,s,l)
    {
        let r, g, b;

        if(s <= 0){
            r = g = b = l; // achromatic
        }else{

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return new Color(
            Math.round(r * 255),
            Math.round(g * 255),
            Math.round(b * 255)
        );
    }
}


function getColorExcluding(... exclusions)
{
    const { bg, palette } = config

    let color;
    do
    {
        color = palette[0|Math.random() * palette.length]
    } while(exclusions.indexOf(color) >= 0)

    return color;
}

function drawPolygon(polygon, palette)
{
    const last = polygon.length - 1
    const [x1, y1] = polygon[last]

    ctx.beginPath()
    ctx.moveTo(
        x1 | 0,
        y1 | 0
    )

    for (let i = 0; i < polygon.length; i++)
    {
        const [x1, y1] = polygon[i]
        ctx.lineTo(x1 | 0, y1 | 0)
    }
    ctx.fill()
    ctx.stroke()
}


/**
 * @type CanvasRenderingContext2D
 */
let ctx;
const resolution = 80


const key = (x,y) => x + "/" + y


let { argv, _ : files } = Yargs

if (!files)
{
    files = ["output.svg"]
}

if (files.length > 1)
{
    console.log("Usage: g59-cairo [<out>]");
    console.log("Generates a random image with a hard coded palette");
    Yargs.showHelp();
    process.exit(1);
}




function render(canvas, width, height)
{
    const angle = Math.random() * TAU

    config.directions = [
        angle,
        angle + TAU / 2,
        angle + TAU / 8 + Math.floor(Math.random() * 4) * TAU / 4
    ]

    const palette = ["#454d66", "#309975", "#58b368", "#dad873", "#efeeb4"]//randomPaletteWithBlack()

    const bgColor = palette[0 | Math.random() * palette.length]
    config.palette = palette
    config.bg = bgColor
    ctx.fillStyle = bgColor

    const fgColor = getLuminance(Color.from(bgColor)) < 10000 ? "#fff" : "#000"

    ctx.fillRect(0, 0, width, height)

    const size = Math.min(width, height)

    const pow = 0.2 + Math.random()

    let area = (width * height) * (0.15 + 0.85 * Math.random())

    const pts = []
    const forces = []

    const sites = new Map()
    while (area > 0)
    {
        const fillColor = getColorExcluding(bgColor, fgColor)

        const choice = 0 | Math.random() * 4

        let gradient = null
        const radius = Math.round(10 + Math.pow(Math.random(), pow) * size / 5)
        const x = 0 | Math.random() * width
        const y = 0 | Math.random() * height

        let angle
        if (!choice)
        {
            ctx.fillStyle = Color.from(fillColor).toRGBA(0.1 + 0.85 * Math.random())
        }
        else
        {
            angle = config.directions[choice - 1]

            gradient = ctx.createLinearGradient(
                x - Math.cos(angle) * radius,
                y - Math.sin(angle) * radius,
                x + Math.cos(angle) * radius,
                y + Math.sin(angle) * radius
            )

            gradient.addColorStop(0, Color.from(fillColor).toRGBA(0.1 + 0.9 * Math.random()))
            gradient.addColorStop(1, Color.from(fillColor).toRGBA(0))
            ctx.fillStyle = gradient
        }

        ctx.beginPath()
        ctx.moveTo(x + radius, y)
        ctx.arc(x, y, +radius, 0, TAU, true)
        ctx.fill()

        const len = TAU * radius
        const count = Math.floor(len / resolution)
        const step = TAU / count
        angle = 0

        const offset = Math.floor(Math.random() * 4) * TAU / 4

        for (let i = 0; i < count; i++)
        {
            const sx = Math.round(x + Math.cos(angle) * radius)
            const sy = Math.round(y + Math.sin(angle) * radius)
            sites.set(key(sx, sy), pts.length)
            pts.push([
                sx,
                sy
            ])
            forces.push([
                Math.cos(angle + offset),
                Math.sin(angle + offset)
            ])

            angle += step
        }

        area -= Math.PI * radius * radius

    }
    // console.log("SITES", sites)
    // console.log("POINTS", pts)

    const v = voronoi().extent([[0, 0], [width, height]])
    const diagram = v(pts)
    // console.log("DIAGRAM", diagram)

    const polygons = diagram.polygons()
    ctx.strokeStyle = fgColor

    polygons.forEach(p => drawPolygon(p, config.palette))

}

const { width, height } = argv

console.log("Creating SVG (", width, " x ", height, ")")

const myCanvas = createCanvas(width, height, "svg");
ctx = myCanvas.getContext("2d")

ctx.beginPath()
ctx.moveTo(0,0)
ctx.lineTo(width,0)
ctx.lineTo(width,height)
ctx.lineTo(0,height)
ctx.clip()

render(myCanvas, width, height)

fs.writeFileSync(files[0], myCanvas.toBuffer())
