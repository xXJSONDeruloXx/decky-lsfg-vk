# This is the default target, which will be built when 
# you invoke make
.PHONY: all
all: hello

# This rule tells make how to build hello from hello.cpp
hello:
	mkdir -p ./out
	gcc -o ./out/hello ./src/main.c 

# This rule tells make to delete hello and hello.o
.PHONY: clean 
clean:
	rm -f hello