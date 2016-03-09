#!/bin/bash

export DYLD_LIBRARY_PATH=/opt/oracle/instantclient/
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
/opt/oracle/instantclient/sqlplus system/oracle@192.168.99.100:49161/xe < "$DIR/drop-tables.sql"
