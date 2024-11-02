#!/usr/bin/env python3

import sys
import json
import subprocess
from typing import TypedDict, Any

class Params(TypedDict):
  rofi_flags: list[str]
  choices: list[str]
  info: Any


def send_message(message: bytes):
  _written = sys.stdout.buffer.write(len(message).to_bytes(4, byteorder='little'))
  _written = sys.stdout.buffer.write(message)
  _none = sys.stdout.flush()


def call_rofi(param: Params):
  rofi_cmd = ['rofi', '-dmenu'] + param['rofi_flags']
  choices = param['choices']

  sh = subprocess.Popen(rofi_cmd, stdout=subprocess.PIPE, stdin=subprocess.PIPE)
  stdout, _stderr = sh.communicate('\n'.join(choices).encode('raw_unicode_escape'))

  return stdout.decode('raw_unicode_escape')


def main():
  while True:
    data_length_bytes = sys.stdin.buffer.read(4).decode('raw_unicode_escape')

    if len(data_length_bytes) == 0:
      break

    data_length = int.from_bytes(data_length_bytes.encode('raw_unicode_escape'), byteorder='little')
    data = sys.stdin.buffer.read(data_length).decode('raw_unicode_escape')

    params: Params = json.loads(data)
    response = {
      'result': call_rofi(params),
      'info': params['info']
    }
    send_message(json.dumps(response).encode('raw_unicode_escape'))


if __name__ == '__main__':
  main()
