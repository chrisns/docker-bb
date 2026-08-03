#include "config.h"
#include <stdio.h>
#include "aalib.h"
#include "aaint.h"

/* Advertise DIM/BOLD/REVERSE in addition to NORMAL so aa_render() actually
 * varies c->attrbuffer per cell (aamktabl.c's ALOWED() only ever picks
 * attribute classes the driver's supported mask includes -- with just
 * AA_NORMAL_MASK, as upstream shipped, attrbuffer is always 0). Not
 * AA_BOLDFONT_MASK: that's a font-switch request for drivers with actual
 * alternate font resources (curses/X11), meaningless for plain text output.
 * Not AA_EXTENDED: see the -extended note in web/worker.js.
 */
static int stdout_init(__AA_CONST struct aa_hardware_params *p,__AA_CONST  void *none, struct aa_hardware_params *dest, void **n)
{
    __AA_CONST static struct aa_hardware_params def={NULL, AA_NORMAL_MASK | AA_DIM_MASK | AA_BOLD_MASK | AA_REVERSE_MASK};
    *dest=def;
    return 1;
}
static void stdout_uninit(aa_context * c)
{
}
static void stdout_getsize(aa_context * c, int *width, int *height)
{
}

/* Frame format consumed by web/worker.js: a WIDTH*HEIGHT+HEIGHT-byte
 * character plane (as upstream), immediately followed by a same-sized
 * attribute plane (each cell's class index 0-4 as a single ASCII digit),
 * then the usual form-feed + newline trailer.
 */
static void stdout_flush(aa_context * c)
{
    int x, y;
    for (y = 0; y < aa_scrheight(c); y++) {
	for (x = 0; x < aa_scrwidth(c); x++) {
	    putc(c->textbuffer[x + y * aa_scrwidth(c)], stdout);
	}
	putc('\n', stdout);
    }
    for (y = 0; y < aa_scrheight(c); y++) {
	for (x = 0; x < aa_scrwidth(c); x++) {
	    putc('0' + (c->attrbuffer[x + y * aa_scrwidth(c)] & 7), stdout);
	}
	putc('\n', stdout);
    }
    putc('\f', stdout);
    putc('\n', stdout);
    fflush(stdout);
}
static void stdout_gotoxy(aa_context * c, int x, int y)
{
}
__AA_CONST struct aa_driver stdout_d =
{
    "stdout", "Standard output driver",
    stdout_init,
    stdout_uninit,
    stdout_getsize,
    NULL,
    NULL,
    stdout_gotoxy,
    stdout_flush,
    NULL
};


static void stderr_flush(aa_context * c)
{
    int x, y;
    for (y = 0; y < aa_scrheight(c); y++) {
	for (x = 0; x < aa_scrwidth(c); x++) {
	    putc(c->textbuffer[x + y * aa_scrwidth(c)], stderr);
	}
	putc('\n', stderr);
    }
    putc('\f', stderr);
    putc('\n', stderr);
    fflush(stderr);
}
__AA_CONST struct aa_driver stderr_d =
{
    "stderr", "Standard error driver",
    stdout_init,
    stdout_uninit,
    stdout_getsize,
    NULL,
    NULL,
    stdout_gotoxy,
    stderr_flush,
    NULL
};
