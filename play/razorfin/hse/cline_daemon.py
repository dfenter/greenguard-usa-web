#!/usr/bin/env python3
# Double-fork launcher so a background job survives this shell session
# being torn down (the tool kills its own process group on timeout).
import os, sys
if os.fork() != 0:
    os._exit(0)
os.setsid()
if os.fork() != 0:
    os._exit(0)
devnull = os.open(os.devnull, os.O_RDWR)
os.dup2(devnull, 0)
with open(sys.argv[1], 'ab') as log:
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
os.execvp(sys.argv[2], sys.argv[2:])
